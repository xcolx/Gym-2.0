from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import CursorResult, and_, case, delete, func, or_, select, update
from sqlalchemy.orm import Session

from app.db.models import BlockedUser, Friend, FriendRequest, User


def create_user_with_email(
    db: Session,
    username: str,
    email: str,
    hashed_password: str,
    uses_ios: bool = False,
    uses_web: bool = False
) -> User:
    """
    Expects a hashed password. The email verification token is set afterwards, because it depends on the ID.
    """
    db_user = User(
        user_name=username,
        email=email,
        created_at=datetime.now(UTC),
        failed_login_attempts=0,
        pw_hash=hashed_password,
        uses_ios=uses_ios,
        uses_web=uses_web,
        weight_unit=0,
        distance_unit=0,
        active=False
    )

    db.add(db_user)

    db.flush()

    db.refresh(db_user)

    return db_user


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.scalars(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    ).first()


def get_user_by_email(db: Session, email: str, include_deleted: bool = False) -> User | None:
    """
    With include_deleted soft-deleted users are matched too, which the uniqueness checks need since the unique
    constraint also covers deleted rows.
    """
    statement = select(User).where(User.email == email)
    if not include_deleted:
        statement = statement.where(User.deleted_at.is_(None))
    return db.scalars(statement).first()


def get_user_by_username(db: Session, username: str) -> User | None:
    """
    Including soft-deleted users.
    """
    return db.scalars(
        select(User).where(User.user_name == username)
    ).first()


def get_active_user_by_username(db: Session, username: str) -> User | None:
    return db.scalars(
        select(User).where(User.user_name == username, User.deleted_at.is_(None))
    ).first()


def get_user_by_reset_token(db: Session, token: str) -> User | None:
    """
    Only if the token hasn't expired yet.
    """
    return db.scalars(
        select(User).where(
            User.pw_reset_token == token,
            User.pw_reset_expire > datetime.now(UTC),
            User.deleted_at.is_(None)
        )
    ).first()


def update_on_failed_login(db: Session, user_id: int) -> None:
    db.execute(
        update(User)
        .where(User.id == user_id)
        .values(failed_login_attempts=func.coalesce(User.failed_login_attempts, 0) + 1)
    )


def update_on_successful_login(db: Session, user_id: int) -> None:
    db.execute(
        update(User)
        .where(User.id == user_id)
        .values(failed_login_attempts=0, last_login=datetime.now(UTC))
    )


def get_friends_list(db: Session, user_id: int) -> list[User]:
    """
    Non-deleted friends, on either side of the friendship.
    """
    friend_ids_stmt = select(
        case(
            (Friend.user_id_1 == user_id, Friend.user_id_2),
            else_=Friend.user_id_1
        )
    ).where(
        or_(Friend.user_id_1 == user_id, Friend.user_id_2 == user_id)
    )

    return list(db.scalars(
        select(User).where(
            User.id.in_(friend_ids_stmt),
            User.deleted_at.is_(None)
        )
    ).all())


def get_friendship(db: Session, user_id_a: int, user_id_b: int) -> Friend | None:
    # Friend rows are stored with user_id_1 < user_id_2 to avoid duplicates
    id_1, id_2 = min(user_id_a, user_id_b), max(user_id_a, user_id_b)
    return db.scalars(
        select(Friend).where(Friend.user_id_1 == id_1, Friend.user_id_2 == id_2)
    ).first()


def are_friends(db: Session, user_id_a: int, user_id_b: int) -> bool:
    """
    Returns True if the two users are friends and neither account is deleted, like get_friends_list.
    """
    if get_friendship(db, user_id_a, user_id_b) is None:
        return False
    active_count = db.scalar(
        select(func.count()).select_from(User).where(User.id.in_([user_id_a, user_id_b]), User.deleted_at.is_(None))
    )
    return active_count == 2


def delete_friendship(db: Session, user_id_a: int, user_id_b: int) -> bool:
    id_1, id_2 = min(user_id_a, user_id_b), max(user_id_a, user_id_b)
    result = db.execute(
        delete(Friend).where(Friend.user_id_1 == id_1, Friend.user_id_2 == id_2)
    )
    return cast(CursorResult[Any], result).rowcount > 0


def get_pending_friend_requests(db: Session, user_id: int) -> list[tuple[FriendRequest, User]]:
    statement = (
        select(FriendRequest, User)
        .join(User, FriendRequest.sender_id == User.id)
        .where(
            FriendRequest.receiver_id == user_id,
            FriendRequest.accepted.is_(None),  # NULL while pending
            User.deleted_at.is_(None)
        )
    )
    return list(db.execute(statement).tuples().all())


def get_sent_friend_requests(db: Session, user_id: int) -> list[tuple[FriendRequest, User]]:
    statement = (
        select(FriendRequest, User)
        .join(User, FriendRequest.receiver_id == User.id)
        .where(
            FriendRequest.sender_id == user_id,
            FriendRequest.accepted.is_(None),  # NULL while pending
            User.deleted_at.is_(None)
        )
    )
    return list(db.execute(statement).tuples().all())


def get_friend_request(db: Session, sender_id: int, receiver_id: int) -> FriendRequest | None:
    """
    Fetches the friend request row from sender to receiver, regardless of its status.
    """
    return db.scalars(
        select(FriendRequest).where(
            FriendRequest.sender_id == sender_id,
            FriendRequest.receiver_id == receiver_id
        )
    ).first()


def create_friend_request(db: Session, sender_id: int, receiver_id: int) -> FriendRequest:
    request = FriendRequest(
        sender_id=sender_id,
        receiver_id=receiver_id,
        timestamp=datetime.now(UTC),
        accepted=None
    )
    db.add(request)
    return request


def reset_friend_request(db: Session, sender_id: int, receiver_id: int) -> None:
    """
    Sets an already existing (declined or previously accepted) request back to pending with a fresh timestamp.
    """
    db.execute(
        update(FriendRequest)
        .where(FriendRequest.sender_id == sender_id, FriendRequest.receiver_id == receiver_id)
        .values(accepted=None, timestamp=datetime.now(UTC))
    )


def accept_friend_request(db: Session, sender_id: int, receiver_id: int) -> None:
    """
    Also makes the two users friends.
    """

    db.execute(
        update(FriendRequest)
        .where(FriendRequest.sender_id == sender_id, FriendRequest.receiver_id == receiver_id)
        .values(accepted=True)
    )

    if not are_friends(db, sender_id, receiver_id):
        id_1, id_2 = min(sender_id, receiver_id), max(sender_id, receiver_id)
        new_bond = Friend(user_id_1=id_1, user_id_2=id_2, since=datetime.now(UTC))
        db.add(new_bond)


def reject_friend_request(db: Session, sender_id: int, receiver_id: int) -> None:
    db.execute(
        update(FriendRequest)
        .where(FriendRequest.sender_id == sender_id, FriendRequest.receiver_id == receiver_id)
        .values(accepted=False)
    )


def delete_pending_friend_request_between(db: Session, user_id_a: int, user_id_b: int) -> bool:
    result = db.execute(
        delete(FriendRequest).where(
            or_(
                and_(FriendRequest.sender_id == user_id_a, FriendRequest.receiver_id == user_id_b),
                and_(FriendRequest.sender_id == user_id_b, FriendRequest.receiver_id == user_id_a)
            ),
            FriendRequest.accepted.is_(None)
        )
    )
    return cast(CursorResult[Any], result).rowcount > 0


def block_target_user(db: Session, user_id: int, blocked_id: int) -> BlockedUser:
    block_entry = BlockedUser(
        user_id=user_id,
        blocked_id=blocked_id,
        since=datetime.now(UTC)
    )
    db.add(block_entry)
    return block_entry


def get_block(db: Session, user_id: int, blocked_id: int) -> BlockedUser | None:
    """
    Fetches the block entry where user_id has blocked blocked_id (one direction only).
    """
    return db.scalars(
        select(BlockedUser).where(BlockedUser.user_id == user_id, BlockedUser.blocked_id == blocked_id)
    ).first()


def get_blocked_users(db: Session, user_id: int) -> list[User]:
    return list(db.scalars(
        select(User)
        .join(BlockedUser, BlockedUser.blocked_id == User.id)
        .where(
            BlockedUser.user_id == user_id,
            User.deleted_at.is_(None)
        )
    ).all())


def is_blocked(db: Session, user_id_a: int, user_id_b: int) -> bool:
    """
    Whether either user blocked the other.
    """
    statement = select(BlockedUser).where(
        or_(
            and_(BlockedUser.user_id == user_id_a, BlockedUser.blocked_id == user_id_b),
            and_(BlockedUser.user_id == user_id_b, BlockedUser.blocked_id == user_id_a)
        )
    )
    return db.scalars(statement).first() is not None


def delete_block(db: Session, user_id: int, blocked_id: int) -> bool:
    result = db.execute(
        delete(BlockedUser).where(BlockedUser.user_id == user_id, BlockedUser.blocked_id == blocked_id)
    )
    return cast(CursorResult[Any], result).rowcount > 0

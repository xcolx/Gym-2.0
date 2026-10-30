from datetime import UTC, datetime

from sqlalchemy.orm import Session

import app.db.queries.session as crud_session
import app.db.queries.users as crud
from app.core import content_filter, nudity_filter, security
from app.core.errors import (
    InvalidUserActionError,
    PermissionDeniedError,
    RelationshipNotFoundError,
    UserAlreadyExistsError,
    UserNotFoundError,
)
from app.db.models import User
from app.schemas import (
    DeleteAccountRequest,
    FriendRequestPatchResponse,
    FriendRequestResponse,
    FriendRequestUpdateRequest,
    SentFriendRequestResponse,
    UpdateEmailRequest,
    UpdatePasswordRequest,
    UpdateUsernameRequest,
    UpdateUserRequest,
    UserImageUpdateResponse,
    UserResponse,
    UserUpdateResponse,
)
from app.services import chat_service, image_service, report_service
from app.services.auth_service import get_or_issue_email_verification, issue_email_verification
from app.util.time import to_iso

PROFILE_IMAGE_QUALITY = 85
PROFILE_IMAGE_MAX_DIMENSION = 1024
PROFILE_ICON_QUALITY = 80
PROFILE_ICON_SIZE = 128


def update_user_profile(db: Session, user: User, payload: UpdateUserRequest) -> UserUpdateResponse:
    update_data = payload.model_dump(exclude_unset=True)

    if not update_data:
        return UserUpdateResponse(success=False, message="No fields provided for update.")

    if "weight_unit" in update_data and update_data["weight_unit"] is None:
        raise InvalidUserActionError("Weight unit cannot be empty.")
    if "distance_unit" in update_data and update_data["distance_unit"] is None:
        raise InvalidUserActionError("Distance unit cannot be empty.")

    for key, value in update_data.items():
        setattr(user, key, value)

    if "bodyweight" in update_data:
        user.updated_bodyweight_at = datetime.now(UTC)

    db.flush()
    return UserUpdateResponse(success=True, message="Profile updated successfully.")


def update_profile_image(db: Session, user: User, file_contents: bytes) -> UserImageUpdateResponse:
    """
    Stores the uploaded profile image together with a square icon cropped from it and replaces the user's old ones.
    Images that NudeNet blocks are rejected, the ones it flags or blocks are reported (report_service.report_nudity).
    """
    image = image_service.decode_image(file_contents)
    report_service.report_nudity(
        db, nudity_filter.check_image(image), user, image,
        image_column="profile_image", quality=PROFILE_IMAGE_QUALITY, max_dimension=PROFILE_IMAGE_MAX_DIMENSION,
        reported_user_id=user.id, user_name=user.user_name
    )
    image_hash = image_service.store_image(db, image, quality=PROFILE_IMAGE_QUALITY, max_dimension=PROFILE_IMAGE_MAX_DIMENSION)
    icon_hash = image_service.store_image(db, image, quality=PROFILE_ICON_QUALITY, max_dimension=PROFILE_ICON_SIZE, square=True)

    image_service.discard_image(db, user.profile_image_url)
    image_service.discard_image(db, user.profile_icon_url)

    user.profile_image_url = image_hash
    user.profile_icon_url = icon_hash
    user.updated_image_at = datetime.now(UTC)
    db.flush()

    return UserImageUpdateResponse(
        success=True,
        image_url=image_hash,
        icon_url=icon_hash,
        message="Profile image uploaded and updated successfully."
    )


def delete_profile_image(db: Session, user: User) -> None:
    if user.profile_image_url is None and user.profile_icon_url is None:
        return

    image_service.discard_image(db, user.profile_image_url)
    image_service.discard_image(db, user.profile_icon_url)

    user.profile_image_url = None
    user.profile_icon_url = None
    user.updated_image_at = datetime.now(UTC)
    db.flush()


def update_username(db: Session, user: User, payload: UpdateUsernameRequest) -> UserUpdateResponse:
    """
    Ensures it isn't taken by any other user, deleted ones included.
    """
    if payload.username == user.user_name:
        return UserUpdateResponse(success=False, message="No changes were made.")

    content_filter.check_username(payload.username)
    if crud.get_user_by_username(db, payload.username):
        raise UserAlreadyExistsError("Username is already taken.")

    user.user_name = payload.username
    user.updated_username_at = datetime.now(UTC)
    db.flush()

    return UserUpdateResponse(success=True, message="Username updated successfully.")


def update_password(db: Session, user: User, payload: UpdatePasswordRequest, current_raw_token: str | None) -> UserUpdateResponse:
    if not user.pw_hash:
        raise PermissionDeniedError("This account uses an external sign-in provider and has no password.")

    if not security.verify_password(payload.current_password, user.pw_hash):
        raise PermissionDeniedError("Incorrect current password.")

    security.validate_password_strength(payload.new_password)

    user.pw_hash = security.get_password_hash(payload.new_password)
    user.updated_pw_at = datetime.now(UTC)

    crud_session.delete_other_sessions_for_user(db, user.id, keep_raw_token=current_raw_token)
    db.flush()

    return UserUpdateResponse(success=True, message="Password updated successfully.")


def _email_change_requested(email: str) -> UserUpdateResponse:
    return UserUpdateResponse(
        success=True,
        message=f"We sent a confirmation link to {email}. Your email changes once you open it."
    )


def update_email(db: Session, user: User, payload: UpdateEmailRequest) -> tuple[UserUpdateResponse, str | None, bool]:
    """
    Requests a change of the user's email after validating the password. The new email is stored in email_change and
    only replaces the email once it is verified, so a typo doesn't lock the user out: until then the user keeps
    logging in with the current email and stays logged in. Requesting the pending email again resends the same link,
    requesting the current email cancels the pending change.
    An email of another account isn't reported to the user, so it doesn't reveal which emails are registered: the
    response is the same as for a change, nothing is changed, and the address is told that it already has an account.
    Returns the response, the raw email verification token for the new email (None if no link has to be sent) and
    whether the new email has to be told that it is already registered.
    """
    if not user.pw_hash:
        raise PermissionDeniedError("This account uses an external sign-in provider and has no password.")

    if not security.verify_password(payload.password, user.pw_hash):
        raise PermissionDeniedError("Incorrect password.")

    if payload.email == user.email:
        if not user.email_change:
            return UserUpdateResponse(success=False, message="No changes were made."), None, False
        user.email_change = None
        user.email_verify_token = None
        user.email_verify_expire = None
        db.flush()
        return UserUpdateResponse(success=True, message="The pending email change was cancelled."), None, False

    if crud.get_user_by_email(db, payload.email, include_deleted=True):
        return _email_change_requested(payload.email), None, True

    if payload.email == user.email_change:
        raw_token = get_or_issue_email_verification(user)
    else:
        user.email_change = payload.email
        raw_token = issue_email_verification(user)

    # Committed before the email is sent, so the link never points to an uncommitted token
    db.commit()

    return _email_change_requested(payload.email), raw_token, False


def resend_email_change(db: Session, user: User) -> tuple[UserUpdateResponse, str]:
    """
    Returns the response and the raw email verification token for the pending email.
    """
    if not user.email_change:
        raise InvalidUserActionError("There is no pending email change.")

    raw_token = get_or_issue_email_verification(user)

    # Committed before the email is sent, so the link never points to an uncommitted token
    db.commit()

    return UserUpdateResponse(
        success=True,
        message=f"We sent the confirmation link to {user.email_change} again. Your email changes once you open it."
    ), raw_token


def get_user_profile(db: Session, current_user: User, target_id: int) -> UserResponse:
    target_user = crud.get_user_by_id(db, target_id)
    if not target_user:
        raise UserNotFoundError("User not found.")

    if current_user.id == target_user.id:
        return UserResponse(
            id=target_user.id,
            username=target_user.user_name,
            email=target_user.email,
            profile_image_url=target_user.profile_image_url or "",
            profile_icon_url=target_user.profile_icon_url or "",
            bodyweight=target_user.bodyweight,
            scheme_color=target_user.scheme_color,
            weight_unit=target_user.weight_unit,
            distance_unit=target_user.distance_unit,
            language=target_user.language,
            created_at=to_iso(target_user.created_at)
        )

    if crud.is_blocked(db, current_user.id, target_user.id):
        raise PermissionDeniedError("Cannot access this user's profile.")

    if crud.are_friends(db, current_user.id, target_user.id):
        return UserResponse(
            id=target_user.id,
            username=target_user.user_name,
            profile_image_url=target_user.profile_image_url or "",
            profile_icon_url=target_user.profile_icon_url or "",
            scheme_color=target_user.scheme_color,
            language=target_user.language
        )

    return UserResponse(
        id=target_user.id,
        username=target_user.user_name,
        profile_image_url=target_user.profile_image_url or "",
        profile_icon_url=target_user.profile_icon_url or "",
        scheme_color=target_user.scheme_color
    )


def find_user_by_username(db: Session, current_user: User, username: str) -> UserResponse:
    """
    Returns the same profile level as get_user_profile.
    """
    target_user = crud.get_active_user_by_username(db, username)
    if not target_user:
        raise UserNotFoundError("User not found.")

    return get_user_profile(db, current_user, target_user.id)


def delete_own_account(db: Session, user: User, payload: DeleteAccountRequest) -> None:
    """
    Accounts without a password (external sign-in provider) need none.
    """
    if user.pw_hash and not (payload.password and security.verify_password(payload.password, user.pw_hash)):
        raise PermissionDeniedError("Incorrect password.")

    delete_user_account(db, user)


def delete_user_account(db: Session, user: User) -> None:
    """
    Soft deletes the user account and logs it out on all devices. The messages the user sent are deleted right away, as if
    the user had deleted each of them, their direct chats are deleted and they leave their group chats.
    The account and its data are removed 30 days later by the daily prune job (app/jobs/prune.py).
    """
    user.deleted_at = datetime.now(UTC)
    crud_session.delete_all_sessions_for_user(db, user.id)
    image_service.discard_image(db, user.profile_image_url)
    image_service.discard_image(db, user.profile_icon_url)
    chat_service.delete_messages_of_user(db, user.id)
    chat_service.remove_user_from_chats(db, user.id)
    db.flush()


def get_pending_friend_requests(db: Session, user: User) -> list[FriendRequestResponse]:
    requests_data = crud.get_pending_friend_requests(db, user.id)

    return [
        FriendRequestResponse(
            sender=UserResponse(
                id=sender.id,
                username=sender.user_name,
                profile_image_url=sender.profile_image_url or "",
                profile_icon_url=sender.profile_icon_url or "",
                scheme_color=sender.scheme_color
            ),
            timestamp=request.timestamp.isoformat()
        ) for request, sender in requests_data
    ]


def get_sent_friend_requests(db: Session, user: User) -> list[SentFriendRequestResponse]:
    requests_data = crud.get_sent_friend_requests(db, user.id)

    return [
        SentFriendRequestResponse(
            receiver=UserResponse(
                id=receiver.id,
                username=receiver.user_name,
                profile_image_url=receiver.profile_image_url or "",
                profile_icon_url=receiver.profile_icon_url or "",
                scheme_color=receiver.scheme_color
            ),
            timestamp=request.timestamp.isoformat()
        ) for request, receiver in requests_data
    ]


def get_friends(db: Session, user: User) -> list[UserResponse]:
    friends = crud.get_friends_list(db, user.id)
    return [
        UserResponse(
            id=f.id,
            username=f.user_name,
            profile_image_url=f.profile_image_url or "",
            profile_icon_url=f.profile_icon_url or "",
            scheme_color=f.scheme_color,
            language=f.language
        ) for f in friends
    ]


def send_friend_request(db: Session, current_user: User, receiver_id: int) -> UserUpdateResponse:
    """
    If the receiver already sent a pending request, that request is accepted instead. A previously declined or accepted
    request is set back to pending.
    """
    if current_user.id == receiver_id:
        raise InvalidUserActionError("Cannot send a friend request to yourself.")

    target_user = crud.get_user_by_id(db, receiver_id)
    if not target_user:
        raise UserNotFoundError("Receiver not found.")

    if crud.is_blocked(db, current_user.id, receiver_id):
        raise PermissionDeniedError("Cannot send friend request.")

    if crud.are_friends(db, current_user.id, receiver_id):
        raise InvalidUserActionError("You are already friends with this user.")

    inbound_request = crud.get_friend_request(db, receiver_id, current_user.id)
    if inbound_request and inbound_request.accepted is None:
        crud.accept_friend_request(db, receiver_id, current_user.id)
        db.flush()
        return UserUpdateResponse(success=True, message="Friend request accepted.")

    existing_request = crud.get_friend_request(db, current_user.id, receiver_id)
    if existing_request:
        if existing_request.accepted is None:
            return UserUpdateResponse(success=True, message="Friend request already sent.")
        crud.reset_friend_request(db, current_user.id, receiver_id)
    else:
        crud.create_friend_request(db, current_user.id, receiver_id)

    db.flush()
    return UserUpdateResponse(success=True, message="Friend request sent.")


def cancel_or_decline_friend_request(db: Session, current_user: User, user_id: int) -> None:
    if not crud.delete_pending_friend_request_between(db, current_user.id, user_id):
        raise RelationshipNotFoundError("Pending friend request not found.")
    db.flush()


def respond_to_friend_request(db: Session, current_user: User, sender_id: int, payload: FriendRequestUpdateRequest) -> FriendRequestPatchResponse:
    request = crud.get_friend_request(db, sender_id, current_user.id)
    if not request or request.accepted is not None:
        raise RelationshipNotFoundError("Pending friend request not found.")

    new_friend = None
    if payload.status:
        sender = crud.get_user_by_id(db, sender_id)
        if not sender:
            raise UserNotFoundError("Sender not found.")
        if crud.is_blocked(db, current_user.id, sender_id):
            raise PermissionDeniedError("Cannot accept friend request.")

        crud.accept_friend_request(db, sender_id, current_user.id)
        new_friend = UserResponse(
            id=sender.id,
            username=sender.user_name,
            profile_image_url=sender.profile_image_url or "",
            profile_icon_url=sender.profile_icon_url or "",
            scheme_color=sender.scheme_color,
            language=sender.language
        )
        message = "Friend request accepted."
    else:
        crud.reject_friend_request(db, sender_id, current_user.id)
        message = "Friend request declined."

    db.flush()

    return FriendRequestPatchResponse(
        success=True,
        message=message,
        new_friend=new_friend
    )


def remove_friend(db: Session, current_user: User, friend_id: int) -> None:
    if not crud.delete_friendship(db, current_user.id, friend_id):
        raise RelationshipNotFoundError("Friendship does not exist.")
    db.flush()


def get_blocked_users(db: Session, user: User) -> list[UserResponse]:
    return [
        UserResponse(
            id=u.id,
            username=u.user_name,
            profile_image_url=u.profile_image_url or "",
            profile_icon_url=u.profile_icon_url or "",
            scheme_color=u.scheme_color
        ) for u in crud.get_blocked_users(db, user.id)
    ]


def block_user(db: Session, current_user: User, target_id: int) -> UserUpdateResponse:
    """
    Blocks the target user and removes an existing friendship and pending friend requests between the two users.
    Reporting the user is a separate request (report_service).
    The direct chat between the two is kept, so that it can be continued once the user is unblocked.
    """
    if current_user.id == target_id:
        raise InvalidUserActionError("You cannot block yourself.")

    target_user = crud.get_user_by_id(db, target_id)
    if not target_user:
        raise UserNotFoundError("Target user not found.")

    if crud.get_block(db, current_user.id, target_id):
        return UserUpdateResponse(success=True, message="User is already blocked.")

    crud.block_target_user(db, current_user.id, target_id)
    crud.delete_friendship(db, current_user.id, target_id)
    crud.delete_pending_friend_request_between(db, current_user.id, target_id)
    db.flush()

    return UserUpdateResponse(success=True, message="User blocked successfully.")


def unblock_user(db: Session, current_user: User, target_id: int) -> None:
    if not crud.delete_block(db, current_user.id, target_id):
        raise RelationshipNotFoundError("Block record not found.")
    db.flush()

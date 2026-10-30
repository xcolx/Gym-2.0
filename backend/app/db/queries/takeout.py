
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.db.models import (
    AIConversation,
    AIMessage,
    BlockedUser,
    Chat,
    ChatUser,
    Exercise,
    Friend,
    FriendRequest,
    Message,
    Report,
    User,
    Workout,
    WorkoutScheme,
)
from app.db.models import Session as UserSession

# Everything stored about one user, for the data takeout (GDPR). Soft deleted rows are included, since they are
# still stored until they are removed for good.


def get_sessions(db: Session, user_id: int) -> list[UserSession]:
    return list(db.scalars(select(UserSession).where(UserSession.user_id == user_id).order_by(UserSession.id)).all())


def get_friends(db: Session, user_id: int) -> list[tuple[Friend, User]]:
    other_id = (Friend.user_id_1 + Friend.user_id_2) - user_id
    return [tuple(row) for row in db.execute(
        select(Friend, User)
        .join(User, User.id == other_id)
        .where(or_(Friend.user_id_1 == user_id, Friend.user_id_2 == user_id))
        .order_by(Friend.since)
    ).all()]


def get_friend_requests(db: Session, user_id: int) -> list[FriendRequest]:
    """The friend requests the user sent or received, in any state."""
    return list(db.scalars(
        select(FriendRequest)
        .where(or_(FriendRequest.sender_id == user_id, FriendRequest.receiver_id == user_id))
        .order_by(FriendRequest.timestamp)
    ).all())


def get_blocks(db: Session, user_id: int) -> list[BlockedUser]:
    """The users the user blocked. Blocks by other users are their data."""
    return list(db.scalars(select(BlockedUser).where(BlockedUser.user_id == user_id).order_by(BlockedUser.since)).all())


def get_reports(db: Session, user_id: int) -> list[Report]:
    """The open reports the user sent. Reports of the user by others are left out, like the blocks."""
    return list(db.scalars(select(Report).where(Report.reporter_id == user_id).order_by(Report.id)).all())


def get_nudenet_reports(db: Session, user_id: int) -> list[Report]:
    """
    The open reports NudeNet created of the user's uploads (no reporter, the user as uploader, see
    core.nudity_filter). Reports of the user by other users are left out.
    """
    return list(db.scalars(
        select(Report).where(Report.reporter_id.is_(None), Report.uploader_id == user_id).order_by(Report.id)
    ).all())


def get_exercises(db: Session, user_id: int) -> list[Exercise]:
    return list(db.scalars(
        select(Exercise).options(joinedload(Exercise.exercise_muscles)).where(Exercise.user_id == user_id).order_by(Exercise.id)
    ).unique().all())


def get_workouts(db: Session, user_id: int) -> list[Workout]:
    return list(db.scalars(
        select(Workout).options(joinedload(Workout.exercises)).where(Workout.user_id == user_id).order_by(Workout.date)
    ).unique().all())


def get_workout_schemes(db: Session, user_id: int) -> list[WorkoutScheme]:
    return list(db.scalars(
        select(WorkoutScheme).options(joinedload(WorkoutScheme.exercises)).where(WorkoutScheme.user_id == user_id).order_by(WorkoutScheme.id)
    ).unique().all())


def get_chat_memberships(db: Session, user_id: int) -> list[tuple[ChatUser, Chat]]:
    return [tuple(row) for row in db.execute(
        select(ChatUser, Chat).join(Chat, Chat.id == ChatUser.chat_id).where(ChatUser.user_id == user_id).order_by(Chat.id)
    ).all()]


def get_chat_members(db: Session, chat_ids: list[int]) -> list[tuple[ChatUser, User]]:
    if not chat_ids:
        return []
    return [tuple(row) for row in db.execute(
        select(ChatUser, User).join(User, User.id == ChatUser.user_id).where(ChatUser.chat_id.in_(chat_ids))
    ).all()]


def get_sent_messages(db: Session, user_id: int) -> list[Message]:
    """The chat messages the user sent, also in chats the user left."""
    return list(db.scalars(select(Message).where(Message.sender_id == user_id).order_by(Message.id)).all())


def get_ai_conversations(db: Session, user_id: int) -> list[AIConversation]:
    return list(db.scalars(select(AIConversation).where(AIConversation.user_id == user_id).order_by(AIConversation.id)).all())


def get_ai_messages(db: Session, conversation_ids: list[int]) -> list[AIMessage]:
    if not conversation_ids:
        return []
    return list(db.scalars(
        select(AIMessage).where(AIMessage.conversation_id.in_(conversation_ids)).order_by(AIMessage.id)
    ).all())


def get_usernames(db: Session, user_ids: set[int]) -> dict[int, str]:
    if not user_ids:
        return {}
    return dict(db.execute(select(User.id, User.user_name).where(User.id.in_(user_ids))).tuples().all())


def get_exercise_names(db: Session, exercise_ids: set[int]) -> dict[int, str]:
    if not exercise_ids:
        return {}
    return dict(db.execute(select(Exercise.id, Exercise.name).where(Exercise.id.in_(exercise_ids))).tuples().all())

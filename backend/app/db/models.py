from datetime import datetime
from uuid import UUID

from sqlalchemy import BIGINT, Boolean, DateTime, ForeignKey, Integer, Numeric, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, INET
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class ExerciseMuscle(Base):
    __tablename__ = "exercise_muscles"
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercise.id", ondelete="CASCADE"), primary_key=True)
    muscle_id: Mapped[int] = mapped_column(ForeignKey("muscle.id"), primary_key=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False)

    exercise: Mapped["Exercise"] = relationship(
        "Exercise",
        back_populates="exercise_muscles"
    )

class ChatUser(Base):
    __tablename__ = "chat_user"
    chat_id: Mapped[int] = mapped_column(ForeignKey("chat.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
    last_read_message_id: Mapped[int] = mapped_column(BIGINT, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    # Whether the member is an admin of the group chat, None for direct chats
    admin: Mapped[bool | None] = mapped_column(Boolean)


class User(Base):
    __tablename__ = "user"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_name: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    # The requested new email, which only replaces email once it is verified
    email_change: Mapped[str | None] = mapped_column(String(255))
    profile_image_url: Mapped[str | None] = mapped_column(String(64))
    profile_icon_url: Mapped[str | None] = mapped_column(String(64))
    bodyweight: Mapped[float | None] = mapped_column(Numeric(4, 1))
    scheme_color: Mapped[str | None] = mapped_column(String(7))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_login_attempts: Mapped[int | None] = mapped_column(Integer, default=0)
    pw_hash: Mapped[str | None] = mapped_column(String(255))
    pw_reset_token: Mapped[str | None] = mapped_column(String(255))
    pw_reset_expire: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    oauth_provider: Mapped[str | None] = mapped_column(String(20))
    oauth_id: Mapped[str | None] = mapped_column(String(255))
    updated_username_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_image_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_bodyweight_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_pw_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    uses_ios: Mapped[bool] = mapped_column(Boolean, nullable=False)
    uses_web: Mapped[bool] = mapped_column(Boolean, nullable=False)
    weight_unit: Mapped[int] = mapped_column(Integer, nullable=False)
    distance_unit: Mapped[int] = mapped_column(Integer, nullable=False)
    language: Mapped[str | None] = mapped_column(String(2))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False)
    email_verify_token: Mapped[str | None] = mapped_column(String(255))
    email_verify_expire: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    workouts: Mapped[list["Workout"]] = relationship(back_populates="user")

class Friend(Base):
    __tablename__ = "friend"
    user_id_1: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
    user_id_2: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
    since: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

class FriendRequest(Base):
    __tablename__ = "friend_request"
    sender_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
    receiver_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted: Mapped[bool | None] = mapped_column(Boolean)

class BlockedUser(Base):
    __tablename__ = "blocked_users"
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
    blocked_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
    since: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

class Report(Base):
    """
    A report of exactly one user, chat or message, with a copy of the reported content (the images are copies owned by
    the report). The reference is set to NULL once the reported row is removed for good, the copy stays.
    """
    __tablename__ = "report"
    id: Mapped[int] = mapped_column(primary_key=True)
    # None for the automatic reports of NudeNet (core.nudity_filter), which have the uploader instead
    reporter_id: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))
    uploader_id: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    reported_user_id: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    reported_chat_id: Mapped[int | None] = mapped_column(ForeignKey("chat.id", ondelete="SET NULL"))
    reported_message_id: Mapped[int | None] = mapped_column(BIGINT, ForeignKey("message.id", ondelete="SET NULL"))
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    user_name: Mapped[str | None] = mapped_column(String(20))
    profile_image: Mapped[str | None] = mapped_column(String(64))
    chat_name: Mapped[str | None] = mapped_column(String(25))
    chat_image: Mapped[str | None] = mapped_column(String(64))
    message_text: Mapped[str | None] = mapped_column(Text)
    message_image: Mapped[str | None] = mapped_column(String(64))

class Equipment(Base):
    __tablename__ = "equipment"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)

class MuscleGroup(Base):
    __tablename__ = "musclegroup"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)

class Muscle(Base):
    __tablename__ = "muscle"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(25), unique=True, nullable=False)
    image_url: Mapped[str] = mapped_column(String(64), nullable=False)

class Exercise(Base):
    __tablename__ = "exercise"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_uuid: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    aliases: Mapped[list[str]] = mapped_column(ARRAY(String(50)), nullable=False, server_default="{}")
    image_urls: Mapped[list[str]] = mapped_column(ARRAY(String(64)), nullable=False, server_default="{}")
    muscle_group_id: Mapped[int] = mapped_column(ForeignKey("musclegroup.id"), nullable=False)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id"), nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    reps: Mapped[bool] = mapped_column(Boolean, nullable=False)
    weights: Mapped[bool] = mapped_column(Boolean, nullable=False)
    time: Mapped[bool] = mapped_column(Boolean, nullable=False)
    intensity: Mapped[bool] = mapped_column(Boolean, nullable=False)
    distance: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    exercise_muscles: Mapped[list["ExerciseMuscle"]] = relationship(
        "ExerciseMuscle",
        back_populates="exercise"
    )

class Workout(Base):
    __tablename__ = "workout"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_uuid: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(25), nullable=False)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration: Mapped[int] = mapped_column(Integer, nullable=False)
    in_progress: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="workouts")
    exercises: Mapped[list["WorkoutExercise"]] = relationship(
        "WorkoutExercise",
        cascade="all, delete-orphan",
        order_by="WorkoutExercise.index"
    )

class WorkoutExercise(Base):
    __tablename__ = "workout_exercise"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_uuid: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    workout_id: Mapped[int] = mapped_column(ForeignKey("workout.id", ondelete="CASCADE"), nullable=False)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercise.id"), nullable=False)
    unilateral: Mapped[bool] = mapped_column(Boolean, nullable=False)
    reps: Mapped[list[int] | None] = mapped_column(ARRAY(Integer), nullable=True)
    weights: Mapped[list[float] | None] = mapped_column(ARRAY(Numeric(5, 1)), nullable=True)
    time: Mapped[list[int] | None] = mapped_column(ARRAY(Integer), nullable=True)
    intensity: Mapped[list[float] | None] = mapped_column(ARRAY(Numeric(6, 2)), nullable=True)
    distance: Mapped[list[float] | None] = mapped_column(ARRAY(Numeric(9, 3)), nullable=True)
    index: Mapped[int] = mapped_column(Integer, nullable=False)

    workout: Mapped["Workout"] = relationship("Workout", back_populates="exercises")

class WorkoutScheme(Base):
    __tablename__ = "workout_scheme"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_uuid: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(25), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_performed: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    exercises: Mapped[list["WorkoutSchemeExercise"]] = relationship(
        "WorkoutSchemeExercise",
        cascade="all, delete-orphan",
        order_by="WorkoutSchemeExercise.index"
    )

class WorkoutSchemeExercise(Base):
    __tablename__ = "workout_scheme_exercise"
    id: Mapped[int] = mapped_column(primary_key=True)
    workout_scheme_id: Mapped[int] = mapped_column(ForeignKey("workout_scheme.id", ondelete="CASCADE"), nullable=False)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercise.id"), nullable=False)
    index: Mapped[int] = mapped_column(Integer, nullable=False)

class Chat(Base):
    __tablename__ = "chat"
    id: Mapped[int] = mapped_column(primary_key=True)
    group_chat: Mapped[bool] = mapped_column(Boolean, nullable=False)
    name: Mapped[str | None] = mapped_column(String(25))
    image_url: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    public: Mapped[bool] = mapped_column(Boolean, nullable=False)
    latest_message_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    latest_message_preview: Mapped[str | None] = mapped_column(String(50))
    latest_message_sender_id: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    name_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    name_updated_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    image_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    image_updated_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    public_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    public_updated_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class Message(Base):
    __tablename__ = "message"
    id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    client_uuid: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    sender_id: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    chat_id: Mapped[int] = mapped_column(ForeignKey("chat.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(64))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class AIConversation(Base):
    __tablename__ = "ai_conversation"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class AIMessage(Base):
    __tablename__ = "ai_message"
    id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    client_uuid: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    conversation_id: Mapped[int] = mapped_column(ForeignKey("ai_conversation.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(9), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

class Session(Base):
    __tablename__ = "session"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    session_token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    agent: Mapped[str] = mapped_column(String(255), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
class RequestStat(Base):
    """The requests the API answered in one hour with the same route, method, status, API version and platform."""
    __tablename__ = "request_stats"
    hour: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    route: Mapped[str] = mapped_column(String(255), primary_key=True)
    method: Mapped[str] = mapped_column(String(10), primary_key=True)
    status: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    api_version: Mapped[str] = mapped_column(String(10), primary_key=True)
    platform: Mapped[str] = mapped_column(String(5), primary_key=True)
    requests: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_ms_sum: Mapped[int] = mapped_column(BIGINT, nullable=False)
    duration_ms_max: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_buckets: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)

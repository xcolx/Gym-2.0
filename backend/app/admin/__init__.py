from app.admin.dashboard import GymAdmin
from app.admin.image_moderation import ImagesView
from app.admin.traffic import TrafficView
from app.admin.views import (
    AIConversationAdmin,
    AIMessageAdmin,
    BlockedUserAdmin,
    ChatAdmin,
    ChatUserAdmin,
    EquipmentAdmin,
    ExerciseAdmin,
    ExerciseMuscleAdmin,
    FriendAdmin,
    FriendRequestAdmin,
    MessageAdmin,
    MuscleAdmin,
    MuscleGroupAdmin,
    ReportAdmin,
    SessionAdmin,
    UserAdmin,
    WorkoutAdmin,
    WorkoutExerciseAdmin,
    WorkoutSchemeAdmin,
    WorkoutSchemeExerciseAdmin,
)

__all__ = ["GymAdmin", "all_admin_views"]

all_admin_views = [
    EquipmentAdmin, MuscleGroupAdmin, MuscleAdmin, ExerciseAdmin, ExerciseMuscleAdmin,
    UserAdmin, SessionAdmin, FriendAdmin, FriendRequestAdmin, BlockedUserAdmin, ReportAdmin,
    WorkoutAdmin, WorkoutExerciseAdmin, WorkoutSchemeAdmin, WorkoutSchemeExerciseAdmin,
    ChatAdmin, ChatUserAdmin, MessageAdmin, AIConversationAdmin, AIMessageAdmin,
    ImagesView, TrafficView,
]

class AppException(Exception):
    """Base of all errors that the exception handlers turn into responses."""
    def __init__(self, message: str = "An unexpected error occurred."):
        self.message = message
        super().__init__(self.message)


class AuthenticationError(AppException):
    """Raised when token validation, cookie parsing, or credentials fail."""
    pass


class PermissionDeniedError(AppException):
    """Raised when a valid user tries to access a resource they do not own."""
    pass


class UserNotFoundError(AppException):
    pass


class WorkoutNotFoundError(AppException):
    pass


class ExerciseNotFoundError(AppException):
    pass


class WorkoutExerciseNotFoundError(AppException):
    pass


class WorkoutSchemeNotFoundError(AppException):
    pass


class UserAlreadyExistsError(AppException):
    """Raised during registration if the email is already taken."""
    pass


class WeakPasswordError(AppException):
    """Raised when a new password does not satisfy the password policy (see core.security)."""
    pass


class InvalidWorkoutStateError(AppException):
    """
    Raised when attempting an illegal action on a workout.
    Example: Inserting a workout exercise at an index past the end of the workout.
    """
    pass


class InvalidRepetitionCountError(AppException):
    """
    Raised when the set data of a workout exercise does not fit the exercise.
    Example: Sending weights for an exercise that does not track weights, or set lists of different lengths.
    """
    pass


class DatabaseTimeoutError(AppException):
    """Raised when no database connection is free within the pool timeout or the database is unreachable (503)."""
    pass

class ExerciseCreationError(AppException):
    pass

class ExerciseInUseError(AppException):
    """
    Raised when deleting an exercise that is part of a workout or workout scheme, or changing its tracked metrics while
    it is part of a workout.
    """
    pass

class EmailVerificationError(AppException):
    """Raised for an invalid or expired verification token, or a login before the email is verified."""
    pass

class DatabaseError(AppException):
    pass

class RelationshipNotFoundError(AppException):
    """Raised when a friend request, friendship or block entry between two users cannot be found."""
    pass

class InvalidUserActionError(AppException):
    """
    Raised when a user action is not allowed in the current state.
    Example: Sending a friend request to yourself or to a user you are already friends with.
    """
    pass

class ChatNotFoundError(AppException):
    pass

class MessageNotFoundError(AppException):
    pass

class InvalidImageError(AppException):
    """Raised when an uploaded file is not a supported image (JPEG, PNG, WebP, HEIC/HEIF) or cannot be decoded."""
    pass

class ImageTooLargeError(AppException):
    """Raised when an uploaded image exceeds the maximum file size or pixel count."""
    pass

class ImageNotFoundError(AppException):
    pass

class AIConversationNotFoundError(AppException):
    pass

class AIServiceUnavailableError(AppException):
    """Raised when the Ollama server cannot be reached, times out or returns an unusable answer."""
    pass

class SyncTimeExpiredError(AppException):
    """
    Raised by the delta endpoints for a last sync time older than DELTA_MAX_AGE (app.db.queries.sync). Rows deleted
    before it may already be removed for good, so the client has to load everything (e.g. GET /workouts) instead.
    """
    pass

class ObjectionableContentError(AppException):
    """Raised when a chat message or a new username contains objectionable words (see core.content_filter)."""
    pass

class FeatureNotImplementedError(AppException):
    """Raised by endpoints that exist in the API but are not implemented yet, e.g. the OAuth sign-in."""
    pass


from pydantic import BaseModel, Field

# Group chat creation, group chat updates and sending messages use multipart/form-data (because of the optional image
# upload), so their fields are declared as Form parameters directly in the endpoints.

class CreateChatRequest(BaseModel):
    user_id: int = Field(
        ...,
        description="The ID of the friend to start a direct chat with",
        examples=[42]
    )


class MarkReadRequest(BaseModel):
    message_id: int = Field(
        ...,
        description="The ID of the newest message the user has read in the chat",
        examples=[1337]
    )

class AddMembersRequest(BaseModel):
    user_ids: list[int] = Field(
        ...,
        min_length=1,
        description="The IDs of the friends to add to the group chat",
        examples=[[42, 43]]
    )


class UpdatePublicRequest(BaseModel):
    public: bool = Field(
        ...,
        description="Whether the group chat should be public (findable and joinable by every user) or private",
        examples=[True]
    )


class UpdateAdminRequest(BaseModel):
    admin: bool = Field(
        ...,
        description="Whether the member should be an admin of the group chat",
        examples=[True]
    )


class MessageResponse(BaseModel):
    id: int = Field(
        ...,
        description="Unique identifier for the message",
        examples=[1]
    )
    chat_id: int = Field(
        ...,
        description="The ID of the chat this message belongs to",
        examples=[1]
    )
    sender_id: int | None = Field(
        default=None,
        description="The ID of the user who sent the message (null if the user no longer exists)",
        examples=[42]
    )
    created_at: str = Field(
        ...,
        description="Date and time the message was sent in ISO 8601 format",
        examples=["2024-06-01T18:30:00Z"]
    )
    content: str | None = Field(
        default=None,
        description="Text content of the message (null for photo-only messages)",
        examples=["See you at the gym!"]
    )
    image_url: str | None = Field(
        default=None,
        description="Image hash of the attached photo (served by GET /v1/images/{hash}), if any",
        examples=["3fa9c1d2e4b5a6978877665544332211ffeeddccbbaa99887766554433221100"]
    )
    deleted_at: str | None = Field(
        default=None,
        description="Date and time the sender deleted the message in ISO 8601 format, null if it isn't deleted. "
                    "Deleted messages only come with /chats/delta (without their text and photo), so that clients "
                    "remove them; GET /chats leaves them out.",
        examples=[None]
    )


class ChatMemberResponse(BaseModel):
    user_id: int = Field(
        ...,
        description="The ID of the chat member",
        examples=[42]
    )
    last_read_message_id: int = Field(
        ...,
        description="The ID of the newest message this member has read in the chat (0 if none)",
        examples=[1337]
    )
    admin: bool | None = Field(
        default=None,
        description="Whether the member is an admin of the group chat (null for direct chats). Admins can rename the "
                    "group, change its image, make it public or private, add and remove members, make other members "
                    "admins and delete it.",
        examples=[True]
    )


class ChatResponse(BaseModel):
    id: int = Field(
        ...,
        description="Unique identifier for the chat",
        examples=[1]
    )
    group_chat: bool = Field(
        ...,
        description="Whether this is a group chat or a direct chat",
        examples=[False]
    )
    name: str | None = Field(
        default=None,
        max_length=25,
        description="Name of the group chat (always null for direct chats)",
        examples=["Leg Day Crew"]
    )
    image_url: str | None = Field(
        default=None,
        description="Image hash of the group chat image (served by GET /v1/images/{hash})",
        examples=["3fa9c1d2e4b5a6978877665544332211ffeeddccbbaa99887766554433221100"]
    )
    created_at: str = Field(
        ...,
        description="Date and time the chat was created in ISO 8601 format",
        examples=["2024-06-01T18:30:00Z"]
    )
    created_by: int | None = Field(
        default=None,
        description="The ID of the user who created the chat",
        examples=[42]
    )
    public: bool = Field(
        ...,
        description="Whether the chat is public",
        examples=[False]
    )
    latest_message_timestamp: str | None = Field(
        default=None,
        description="Date and time of the latest message in ISO 8601 format",
        examples=["2024-06-01T18:30:00Z"]
    )
    latest_message_preview: str | None = Field(
        default=None,
        max_length=50,
        description="Preview of the latest message (max 50 characters)",
        examples=["See you at the gym!"]
    )
    latest_message_sender_id: int | None = Field(
        default=None,
        description="The ID of the user who sent the latest message",
        examples=[42]
    )
    members: list[ChatMemberResponse] = Field(
        ...,
        description="All users in the chat together with their read state"
    )
    messages: list[MessageResponse] = Field(
        default=[],
        description="Messages of the chat, ordered from oldest to newest"
    )


class ChatReadStateResponse(BaseModel):
    chat_id: int = Field(
        ...,
        description="The ID of the chat",
        examples=[1]
    )
    members: list[ChatMemberResponse] = Field(
        ...,
        description="All users in the chat together with their read state"
    )


class ChatListResponse(BaseModel):
    chats: list[ChatResponse] = Field(
        ...,
        description="All chats of the current user including their members and all messages"
    )
    sync_time: str = Field(
        ...,
        description="Database timestamp of this response in ISO 8601 format. Pass it as last_sync_time to /chats/delta for the next sync.",
        examples=["2024-06-01T18:30:00.123456+00:00"]
    )


class ChatDeltaResponse(BaseModel):
    """
    Every chat that changed since the last sync of the client (new or deleted messages, created, renamed, new image,
    made public or private, user added), each with its current metadata and members but only the messages sent or
    deleted since the last sync. A deleted message has deleted_at set and no content. Chats the user was added to
    contain all of their messages. Clients should treat every chat as an upsert and ignore messages they already have,
    because a change can be delivered more than once. Also contains the members and read state of every chat of the
    user, since read state changes are not tracked with timestamps.
    """
    chats: list[ChatResponse] = Field(
        ...,
        description="Chats that changed since the last sync, each with its current members and only the new and deleted messages"
    )
    read_states: list[ChatReadStateResponse] = Field(
        ...,
        description="Members and their last read message ID for every chat of the user"
    )
    sync_time: str = Field(
        ...,
        description="Database timestamp of this response in ISO 8601 format. Pass it as last_sync_time for the next sync.",
        examples=["2024-06-01T18:30:00.123456+00:00"]
    )

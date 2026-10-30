from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateAIConversationRequest(BaseModel):
    title: str | None = Field(
        default=None,
        max_length=50,
        description="Title of the conversation. If left out, the beginning of the first message is used.",
        examples=["3 day split"]
    )


class UpdateAIConversationRequest(BaseModel):
    title: str = Field(
        ...,
        max_length=50,
        description="New title of the conversation",
        examples=["3 day split"]
    )


class SendAIMessageRequest(BaseModel):
    content: str = Field(
        ...,
        max_length=10000,
        description="Text of the message sent to the AI",
        examples=["Give me a 3 day split workout routine"]
    )
    client_uuid: UUID | None = Field(
        default=None,
        description="Set by the client. If a message with the same client_uuid was already sent in the conversation, "
                    "that message and its answer are returned instead of asking the AI again.",
        examples=["3fa85f64-5717-4562-b3fc-2c963f66afa6"]
    )


class AIMessageResponse(BaseModel):
    id: int = Field(
        ...,
        description="Unique identifier for the message",
        examples=[1]
    )
    conversation_id: int = Field(
        ...,
        description="The ID of the conversation this message belongs to",
        examples=[1]
    )
    role: Literal["user", "assistant"] = Field(
        ...,
        description="Whether the message was sent by the user or is an answer of the AI",
        examples=["user"]
    )
    content: str = Field(
        ...,
        description="Text of the message",
        examples=["Give me a 3 day split workout routine"]
    )
    created_at: str = Field(
        ...,
        description="Date and time the message was created in ISO 8601 format",
        examples=["2024-06-01T18:30:00+00:00"]
    )


class AIConversationResponse(BaseModel):
    id: int = Field(
        ...,
        description="Unique identifier for the conversation",
        examples=[1]
    )
    title: str | None = Field(
        default=None,
        max_length=50,
        description="Title of the conversation (null until it is set or the first message is sent)",
        examples=["3 day split"]
    )
    created_at: str = Field(
        ...,
        description="Date and time the conversation was created in ISO 8601 format",
        examples=["2024-06-01T18:30:00+00:00"]
    )
    updated_at: str = Field(
        ...,
        description="Date and time of the latest message or rename in ISO 8601 format",
        examples=["2024-06-01T18:30:00+00:00"]
    )
    messages: list[AIMessageResponse] = Field(
        default=[],
        description="Messages of the conversation, ordered from oldest to newest (empty in lists of conversations)"
    )


class SendAIMessageResponse(BaseModel):
    user_message: AIMessageResponse = Field(
        ...,
        description="The stored message of the user"
    )
    assistant_message: AIMessageResponse = Field(
        ...,
        description="The answer of the AI"
    )

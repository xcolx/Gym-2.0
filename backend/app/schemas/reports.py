
from pydantic import BaseModel, Field, field_validator, model_validator

# The clients cut the reason to this length (ReportAlert.maxReasonLength, MAX_REPORT_REASON_LENGTH)
MAX_REPORT_REASON_LENGTH = 500


class CreateReportRequest(BaseModel):
    """Reports exactly one user, group chat or message."""
    reported_user_id: int | None = Field(
        None,
        description="The user to report.",
        examples=[42]
    )
    reported_chat_id: int | None = Field(
        None,
        description="The group chat to report, e.g. for its name or image. Public groups can be reported without being a member.",
        examples=[None]
    )
    reported_message_id: int | None = Field(
        None,
        description="The message to report, in a chat the current user is a member of.",
        examples=[None]
    )
    reason: str = Field(
        ...,
        max_length=MAX_REPORT_REASON_LENGTH,
        description="Why the user, chat or message is reported.",
        examples=["Sends spam messages."]
    )

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Provide a reason for the report.")
        return value

    @model_validator(mode="after")
    def check_one_target(self) -> "CreateReportRequest":
        targets = [self.reported_user_id, self.reported_chat_id, self.reported_message_id]
        if sum(target is not None for target in targets) != 1:
            raise ValueError("Report exactly one user, chat or message.")
        return self


class ReportResponse(BaseModel):
    id: int = Field(
        ...,
        description="Unique identifier for the report.",
        examples=[1]
    )
    reported_user_id: int | None = Field(None, examples=[42])
    reported_chat_id: int | None = Field(None, examples=[None])
    reported_message_id: int | None = Field(None, examples=[None])
    reason: str = Field(
        ...,
        description="Why it was reported.",
        examples=["Sends spam messages."]
    )
    created_at: str = Field(
        ...,
        description="When the report was sent in ISO 8601 format.",
        examples=["2026-10-20T18:30:00Z"]
    )

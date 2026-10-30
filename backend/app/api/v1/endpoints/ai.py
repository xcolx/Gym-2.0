from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.deps import DbSession, get_current_user
from app.core.rate_limit import limiter
from app.schemas import (
    AIConversationResponse,
    CreateAIConversationRequest,
    SendAIMessageRequest,
    SendAIMessageResponse,
    UpdateAIConversationRequest,
)
from app.services import ai_service

router = APIRouter()

@router.get("", status_code=status.HTTP_200_OK, response_model=list[AIConversationResponse])
@limiter.limit("30/minute")
def get_all(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Retrieves all AI conversations of the current user without their messages, the most recently updated first.
    """
    return ai_service.get_all_conversations(db, user)


@router.get("/{conversation_id}", status_code=status.HTTP_200_OK, response_model=AIConversationResponse)
@limiter.limit("60/minute")
def get_conversation(
    request: Request,
    conversation_id: int,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Retrieves an AI conversation of the current user with all of its messages, ordered from oldest to newest.
    """
    return ai_service.get_conversation(db, user, conversation_id)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=AIConversationResponse)
@limiter.limit("30/minute")
def create_conversation(
    request: Request,
    payload: CreateAIConversationRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Creates a new, empty AI conversation. Without a title, the beginning of the first message becomes the title.
    """
    return ai_service.create_conversation(db, user, payload)


@router.patch("/{conversation_id}", status_code=status.HTTP_200_OK, response_model=AIConversationResponse)
@limiter.limit("30/minute")
def update_conversation(
    request: Request,
    conversation_id: int,
    payload: UpdateAIConversationRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    return ai_service.update_conversation(db, user, conversation_id, payload)


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_conversation(
    request: Request,
    conversation_id: int,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    ai_service.delete_conversation(db, user, conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{conversation_id}/messages", status_code=status.HTTP_201_CREATED, response_model=SendAIMessageResponse)
@limiter.limit("20/minute")
def send_message(
    request: Request,
    conversation_id: int,
    payload: SendAIMessageRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Sends a message to the AI and waits for its answer, which can take a while. Returns the stored message and the answer.
    If the AI is unavailable (503), nothing is stored and the message can be sent again.
    Sending a message with a client_uuid that was already used in the conversation returns the stored message and answer.
    """
    return ai_service.send_message(db, user, conversation_id, payload)

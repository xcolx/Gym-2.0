from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import DbSession, get_current_user
from app.core.rate_limit import limiter
from app.schemas import (
    AddMembersRequest,
    ChatDeltaResponse,
    ChatListResponse,
    ChatResponse,
    CreateChatRequest,
    MarkReadRequest,
    MessageResponse,
    UpdateAdminRequest,
    UpdatePublicRequest,
)
from app.services import chat_service, image_service

router = APIRouter()

@router.get("", status_code=status.HTTP_200_OK, response_model=ChatListResponse)
@limiter.limit("10/minute")
def get_all(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Retrieves all chats of the current user including their members (with their read state) and all messages,
    together with the sync_time to pass to /chats/delta for the next sync.
    """
    return chat_service.get_all_chats(db, user)


@router.get("/delta", status_code=status.HTTP_200_OK, response_model=ChatDeltaResponse)
# The apps poll every second while a chat is open. The limit is per IP, which several users can share (e.g. a gym's
# Wi-Fi).
@limiter.limit("600/minute")
def get_delta(
    request: Request,
    last_sync_time: datetime,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Retrieves all chats with messages sent since the provided timestamp (only those new messages are included)
    as well as all chats created, renamed or given a new image since then.
    The timestamp is tracked per client device, using the sync_time of the previous response.
    A last_sync_time older than 28 days is rejected with 400 (SyncTimeExpiredError): load everything with GET /chats instead.
    """
    return chat_service.get_chat_delta(db, user, last_sync_time)


@router.get("/public", status_code=status.HTTP_200_OK, response_model=list[ChatResponse])
@limiter.limit("30/minute")
def get_public_chats(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Retrieves all public group chats including their members, but without messages.
    """
    return chat_service.get_public_chats(db)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ChatResponse)
@limiter.limit("30/minute")
def create_chat(
    request: Request,
    response: Response,
    payload: CreateChatRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Creates a direct chat between the current user and a friend (201).
    If a direct chat between the two already exists, that chat is returned instead (200).
    """
    chat, created = chat_service.create_chat(db, user, payload)
    if not created:
        response.status_code = status.HTTP_200_OK
    return chat


@router.post("/groups", status_code=status.HTTP_201_CREATED, response_model=ChatResponse)
@limiter.limit("10/minute")
def create_group_chat(
    request: Request,
    name: str = Form(..., max_length=25),
    user_ids: list[int] = Form([]),
    public: bool = Form(False),
    image: UploadFile | None = File(None),
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Creates a group chat with the given name and optional image between the current user and a list of friends.
    Public group chats can be found and joined by every user, so user_ids can be empty for them.
    Uses multipart/form-data, user_ids is sent as a repeated form field.
    """
    image_contents = image_service.read_upload(image.file) if image else None

    return chat_service.create_group_chat(db, user, name, user_ids, public, image_contents)


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
def delete_message(
    request: Request,
    message_id: int,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Deletes a message the current user sent, or a message of another member in a group chat the current user is an
    admin of (soft delete). The other members' apps remove it with their next /chats/delta, which delivers it with
    deleted_at set; GET /chats leaves it out. To report it as well, report it first: deleted messages can't be reported.
    404 if the message doesn't exist or is already deleted, 403 for a message of another user otherwise.
    """
    chat_service.delete_message(db, user, message_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{chat_id}", status_code=status.HTTP_200_OK, response_model=ChatResponse)
@limiter.limit("30/minute")
def update_group_chat(
    request: Request,
    chat_id: int,
    name: str | None = Form(None, max_length=25),
    image: UploadFile | None = File(None),
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Changes the name and/or image of a group chat. Only admins of the group chat can change them.
    Uses multipart/form-data, fields that are left out stay unchanged.
    """
    image_contents = image_service.read_upload(image.file) if image else None

    return chat_service.update_group_chat(db, user, chat_id, name, image_contents)


@router.delete("/{chat_id}/image", status_code=status.HTTP_200_OK, response_model=ChatResponse)
@limiter.limit("30/minute")
def delete_group_chat_image(
    request: Request,
    chat_id: int,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Removes the image of a group chat. Only admins of the group chat can remove it.
    The other members' apps receive the chat without image through /chats/delta.
    """
    return chat_service.delete_group_chat_image(db, user, chat_id)


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_chat(
    request: Request,
    chat_id: int,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Deletes a chat for all of its members. Both members of a direct chat can delete it, a group chat only its admins.
    The members' apps remove it with the next /chats/delta, a later direct chat between the same users starts empty.
    """
    chat_service.delete_chat(db, user, chat_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{chat_id}/visibility", status_code=status.HTTP_200_OK, response_model=ChatResponse)
@limiter.limit("30/minute")
def update_public(
    request: Request,
    chat_id: int,
    payload: UpdatePublicRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Makes a group chat public or private. Only admins of the group chat can do that.
    """
    return chat_service.update_public(db, user, chat_id, payload)


@router.post("/{chat_id}/members/me", status_code=status.HTTP_201_CREATED, response_model=ChatResponse)
@limiter.limit("30/minute")
def join_public_chat(
    request: Request,
    response: Response,
    chat_id: int,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Joins a public group chat and returns it with all of its messages (201).
    If the current user is already a member, the chat is returned unchanged (200).
    """
    chat, joined = chat_service.join_public_chat(db, user, chat_id)
    if not joined:
        response.status_code = status.HTTP_200_OK
    return chat


@router.post("/{chat_id}/members", status_code=status.HTTP_200_OK, response_model=ChatResponse)
@limiter.limit("30/minute")
def add_members(
    request: Request,
    chat_id: int,
    payload: AddMembersRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Adds friends of the current user to a private group chat as members that aren't admins. Only admins can add members,
    public group chats are joined through POST /chats/{id}/members/me instead. Users that already are members are skipped.
    The added users receive the chat with all its messages through /chats/delta.
    """
    return chat_service.add_members(db, user, chat_id, payload)


@router.delete("/{chat_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def remove_member(
    request: Request,
    chat_id: int,
    user_id: int,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Removes a member (admins too) from a private group chat. Only admins can remove members.
    Passing the current user's own ID leaves the group chat, which also works for public group chats.
    When the last admin leaves, a random other member becomes admin. A group chat without members is deleted.
    """
    chat_service.remove_member(db, user, chat_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{chat_id}/members/{user_id}", status_code=status.HTTP_200_OK, response_model=ChatResponse)
@limiter.limit("30/minute")
def update_admin(
    request: Request,
    chat_id: int,
    user_id: int,
    payload: UpdateAdminRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Makes a member of a group chat an admin or removes their admin status. Only admins can do that, also for
    themselves, but the last admin can't remove their own admin status. The other members receive the change with
    the read states of /chats/delta.
    """
    return chat_service.update_admin(db, user, chat_id, user_id, payload)


@router.post("/{chat_id}/messages", status_code=status.HTTP_201_CREATED, response_model=MessageResponse)
@limiter.limit("120/minute")
def send_message(
    request: Request,
    chat_id: int,
    content: str | None = Form(None, max_length=10000),
    client_uuid: UUID | None = Form(None),
    image: UploadFile | None = File(None),
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Sends a message with text and/or a photo to a chat the current user is a member of.
    In a direct chat the other member has to still be a friend, and neither may have blocked the other.
    Uses multipart/form-data. If the user already sent a message with the same client_uuid, that message is returned instead.
    """
    image_contents = image_service.read_upload(image.file) if image else None

    return chat_service.send_message(db, user, chat_id, content, image_contents, client_uuid)


@router.put("/{chat_id}/read-marker", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("120/minute")
def mark_read(
    request: Request,
    chat_id: int,
    payload: MarkReadRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Marks all messages up to the given message as read by the current user in the chat.
    The read state only moves forward.
    """
    chat_service.mark_read(db, user, chat_id, payload)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

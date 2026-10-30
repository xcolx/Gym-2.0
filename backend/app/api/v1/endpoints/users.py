import os
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, Request, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.core.cookies import SESSION_COOKIE_NAME, clear_session_cookie
from app.core.deps import DbSession, get_current_user
from app.core.rate_limit import limiter
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
from app.schemas.fields import Username
from app.services import image_service, mail_service, takeout_service, user_service

router = APIRouter()

TAKEOUT_CHUNK_SIZE = 64 * 1024


@router.get("/me", status_code=status.HTTP_200_OK, response_model=UserResponse)
@limiter.limit("600/minute")
def get_me(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Also lets clients check whether their session is still valid (401 if not).
    """
    return user_service.get_user_profile(db, user, user.id)


@router.patch("/me", status_code=status.HTTP_200_OK, response_model=UserUpdateResponse)
@limiter.limit("120/minute")
def update_user(
    request: Request,
    payload: UpdateUserRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    return user_service.update_user_profile(db, user, payload)


@router.put("/me/profile-image", status_code=status.HTTP_200_OK, response_model=UserImageUpdateResponse)
@limiter.limit("3/minute")
def update_profile_image(
    request: Request,
    file: UploadFile = File(...),
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Uploads a new profile image (JPEG, PNG, WebP or HEIC) via multipart/form-data.
    A square icon is generated from it. The response contains the hashes of both, which are served by GET /images/{hash}.
    """
    contents = image_service.read_upload(file.file)

    return user_service.update_profile_image(db, user, contents)


@router.delete("/me/profile-image", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/minute")
def delete_profile_image(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    user_service.delete_profile_image(db, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/me/username", status_code=status.HTTP_200_OK, response_model=UserUpdateResponse)
@limiter.limit("1/minute")
def update_username(
    request: Request,
    payload: UpdateUsernameRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    return user_service.update_username(db, user, payload)


@router.patch("/me/password", status_code=status.HTTP_200_OK, response_model=UserUpdateResponse)
@limiter.limit("1/minute")
def update_password(
    request: Request,
    payload: UpdatePasswordRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Requires the old password. All other sessions of the user are logged out.
    """
    return user_service.update_password(db, user, payload, request.cookies.get(SESSION_COOKIE_NAME))


@router.patch("/me/email", status_code=status.HTTP_200_OK, response_model=UserUpdateResponse)
@limiter.limit("1/minute")
def update_email(
    request: Request,
    response: Response,
    payload: UpdateEmailRequest,
    background_tasks: BackgroundTasks,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Requests a change of the email address of the current user. Requires password confirmation. A confirmation link is sent
    to the new email, which only replaces the current one once it is verified. The user stays logged in.
    Sending the current email cancels a pending change, sending the pending one again resends the link.
    An email of another account gets the same response, but changes nothing: that address is told it already has an account.
    """
    result, raw_token, already_registered = user_service.update_email(db, user, payload)

    if raw_token:
        # If sending fails, the user can request the email again via POST /me/email/verification
        background_tasks.add_task(
            mail_service.send_verification_email, user.email_change, user.id, raw_token, user.email_verify_expire, "email_change"
        )
    elif already_registered:
        # Sent after the response like the link, so the response time doesn't reveal the account either
        background_tasks.add_task(mail_service.send_already_registered_email, payload.email, user.id)

    return result


@router.post("/me/email/verification", status_code=status.HTTP_200_OK, response_model=UserUpdateResponse)
@limiter.limit("2/minute")
def resend_email_change(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Sends the confirmation link of the pending email change (PATCH /me/email) again, e.g. if it didn't arrive.
    The link stays the same until it expires. 400 (InvalidUserActionError) if no email change is pending.
    /auth/verify-email/resend only resends the links of unverified signups.
    """
    result, raw_token = user_service.resend_email_change(db, user)

    background_tasks.add_task(
        mail_service.send_verification_email, user.email_change, user.id, raw_token, user.email_verify_expire, "email_change"
    )

    return result


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("1/minute")
def delete_user(
    request: Request,
    payload: DeleteAccountRequest,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Soft deletes the current user account. Requires password confirmation, unless the account has no password (external sign-in provider).
    The messages the user sent are deleted right away (the other members' apps remove them with their next /chats/delta).
    The account and its data are removed 30 days later by the daily prune job (app/jobs/prune.py).
    """
    user_service.delete_own_account(db, user, payload)

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response)
    return response


@router.get("/me/takeout", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
def get_data_takeout(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Returns all data stored about the current user as a ZIP archive (GDPR data access): the account, sessions, friends,
    friend requests, blocks and reports, created exercises, workouts, workout schemes, chats with the messages the user
    sent and the AI conversations, including deleted items that are still stored. The archive has one folder with
    data.json, which lists images by their hash, and images/<hash>.jpg with the files of these images.
    Sent as a download (Content-Disposition: attachment).
    """
    takeout = takeout_service.build_takeout(db, user)
    name = f"gym2-data-takeout-{datetime.now(UTC):%Y-%m-%d}"
    archive = takeout_service.build_archive(takeout, name)
    size = archive.seek(0, os.SEEK_END)
    archive.seek(0)

    return StreamingResponse(
        iter(lambda: archive.read(TAKEOUT_CHUNK_SIZE), b""),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{name}.zip"',
            "Content-Length": str(size),
            "Cache-Control": "no-store",
        },
        background=BackgroundTask(archive.close),
    )


@router.get("/me/friend-requests", status_code=status.HTTP_200_OK, response_model=list[FriendRequestResponse])
@limiter.limit("30/minute")
def get_friend_requests(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    return user_service.get_pending_friend_requests(db, user)


@router.get("/me/friend-requests/sent", status_code=status.HTTP_200_OK, response_model=list[SentFriendRequestResponse])
@limiter.limit("30/minute")
def get_sent_friend_requests(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Returns a list of pending friend requests sent by the current user. They can be cancelled with DELETE /users/me/friend-requests/{user_id}.
    """
    return user_service.get_sent_friend_requests(db, user)


@router.get("/me/friends", status_code=status.HTTP_200_OK, response_model=list[UserResponse])
@limiter.limit("30/minute")
def get_friends_list(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    return user_service.get_friends(db, user)


@router.post("/me/friend-requests/{receiver_id}", status_code=status.HTTP_201_CREATED, response_model=UserUpdateResponse)
@limiter.limit("60/minute")
def send_friend_request(
    receiver_id: int,
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Sends a friend request from the current user to another user.
    If the other user already sent a pending request to the current user, it is accepted instead.
    """
    return user_service.send_friend_request(db, user, receiver_id)


@router.delete("/me/friend-requests/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
def cancel_or_decline_friend_request(
    user_id: int,
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Deletes the pending friend request between the current user and the given user,
    cancelling it if the current user is the sender or declining it if they are the receiver.
    """
    user_service.cancel_or_decline_friend_request(db, user, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/me/friend-requests/{sender_id}", status_code=status.HTTP_200_OK, response_model=FriendRequestPatchResponse)
@limiter.limit("60/minute")
def respond_to_friend_request(
    sender_id: int,
    payload: FriendRequestUpdateRequest,
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Accepting the request makes the two users friends.
    """
    return user_service.respond_to_friend_request(db, user, sender_id, payload)


@router.delete("/me/friends/{friend_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
def remove_friend(
    friend_id: int,
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    user_service.remove_friend(db, user, friend_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/blocked-users", status_code=status.HTTP_200_OK, response_model=list[UserResponse])
@limiter.limit("20/minute")
def get_blocked_users(
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    return user_service.get_blocked_users(db, user)


@router.put("/me/blocked-users/{user_id}", status_code=status.HTTP_201_CREATED, response_model=UserUpdateResponse)
@limiter.limit("30/minute")
def block_user(
    user_id: int,
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Blocks a user for the current user, preventing interactions, and removes the friendship between the two.
    Shared group chats are unaffected and the direct chat is kept, but no messages can be sent in it.
    """
    return user_service.block_user(db, user, user_id)


@router.delete("/me/blocked-users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def unblock_user(
    user_id: int,
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    user_service.unblock_user(db, user, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# "/{id}" must stay below all static routes of this router

@router.get("", status_code=status.HTTP_200_OK, response_model=UserResponse)
@limiter.limit("30/minute")
def find_user_by_username(
    request: Request,
    username: Annotated[Username, Query(description="The exact, case-sensitive username to look up.")],
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Finds a user by their exact username, e.g. to send them a friend request.
    Returns full info for the current user, friend-level info for friends, or public info otherwise.
    """
    return user_service.find_user_by_username(db, user, username)


@router.get("/{id}", status_code=status.HTTP_200_OK, response_model=UserResponse)
@limiter.limit("600/minute")
def get_user(
    id: int,
    request: Request,
    db: Session = DbSession,
    user = Depends(get_current_user)
):
    """
    Retrieves user profile information by ID. Returns full info if it matches the current user,
    friend-level info if they are friends, or public info otherwise.
    """
    return user_service.get_user_profile(db, user, id)

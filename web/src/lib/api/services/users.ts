// Port of ios/Gym 2.0/Core/Services/UserService.swift and FriendService.swift. After changing the current user's
// profile online, call `refreshCurrentUser()` of lib/auth to update the session.

import { formData, send, sendForBlob, sendVoid, type ImageUpload } from "../client";
import type {
  FriendRequestAnswerDTO,
  FriendRequestDTO,
  ProfileImageDTO,
  ProfileUpdate,
  SentFriendRequestDTO,
  UpdateResultDTO,
  UserDTO,
} from "../dto";

export const userApi = {
  /** The current user's full profile. Fails with an `unauthorized` ApiError if the session is no longer valid. */
  me: () => send<UserDTO>({ method: "GET", path: "/users/me" }),

  /**
   * Full info for the current user, friend-level info for friends, public info otherwise.
   * Fails with 403 if the user blocked the current user.
   */
  user: (id: number) => send<UserDTO>({ method: "GET", path: `/users/${id}` }),

  /** Finds a user by their exact, case-sensitive username. Fails with 404 if there is none. */
  lookup: (username: string) => send<UserDTO>({ method: "GET", path: "/users", query: { username } }),

  // MARK: - Current user

  /** Online only. The offline settings (bodyweight, units, color) go through lib/repo/user.ts and the sync instead. */
  updateProfile: (update: ProfileUpdate) =>
    send<UpdateResultDTO>({ method: "PATCH", path: "/users/me", json: update }),

  /** Uploads a new profile image. The backend also generates a square icon from it. */
  updateProfileImage: (image: ImageUpload) =>
    send<ProfileImageDTO>({ method: "PUT", path: "/users/me/profile-image", form: formData({}, { file: image }) }),

  deleteProfileImage: () => sendVoid({ method: "DELETE", path: "/users/me/profile-image" }),

  /** Fails with 400 if the username is taken. Limited to once a minute. */
  changeUsername: (username: string) =>
    send<UpdateResultDTO>({ method: "PATCH", path: "/users/me/username", json: { username } }),

  /** Ends all other sessions, the current one stays valid. Fails with 403 if the current password is wrong. */
  changePassword: (currentPassword: string, newPassword: string) =>
    send<UpdateResultDTO>({ method: "PATCH", path: "/users/me/password", json: { currentPassword, newPassword } }),

  /**
   * Sends a confirmation link to the new address, which only replaces the current email once it is confirmed. The
   * session stays valid. Sending the current email cancels a pending change. Fails with 403 if the password is wrong.
   */
  changeEmail: (email: string, password: string) =>
    send<UpdateResultDTO>({ method: "PATCH", path: "/users/me/email", json: { email, password } }),

  /**
   * Deletes the account and ends the session, the password confirms it. Use `deleteAccount()` of lib/auth, which also
   * removes the local data.
   */
  deleteAccount: (password: string) => sendVoid({ method: "DELETE", path: "/users/me", json: { password } }),

  /**
   * All data the server stores about the current user as a ZIP file with data.json and the images (GDPR). Limited to 5
   * requests an hour. A large account takes a while, so the timeout is longer than the default.
   */
  dataTakeout: () => sendForBlob({ method: "GET", path: "/users/me/takeout", timeoutMs: 120_000 }),
};

export const friendApi = {
  friends: () => send<UserDTO[]>({ method: "GET", path: "/users/me/friends" }),

  /** Removes the friendship for both users. */
  removeFriend: (id: number) => sendVoid({ method: "DELETE", path: `/users/me/friends/${id}` }),

  // MARK: - Friend requests

  /** The pending requests the current user received. */
  friendRequests: () => send<FriendRequestDTO[]>({ method: "GET", path: "/users/me/friend-requests" }),

  /** The pending requests the current user sent, they can be cancelled with `deleteFriendRequest()`. */
  sentFriendRequests: () => send<SentFriendRequestDTO[]>({ method: "GET", path: "/users/me/friend-requests/sent" }),

  /** If the other user already sent the current user a request, it is accepted instead. */
  sendFriendRequest: (userId: number) =>
    send<UpdateResultDTO>({ method: "POST", path: `/users/me/friend-requests/${userId}` }),

  answerFriendRequest: (senderId: number, accept: boolean) =>
    send<FriendRequestAnswerDTO>({
      method: "PATCH",
      path: `/users/me/friend-requests/${senderId}`,
      json: { status: accept },
    }),

  /** Cancels the request the current user sent to the user, or declines the one the user sent. */
  deleteFriendRequest: (userId: number) => sendVoid({ method: "DELETE", path: `/users/me/friend-requests/${userId}` }),

  // MARK: - Blocked users

  blockedUsers: () => send<UserDTO[]>({ method: "GET", path: "/users/me/blocked-users" }),

  /** Blocking also removes the friendship. Reporting the user is a separate request (reportApi). */
  block: (userId: number) => send<UpdateResultDTO>({ method: "PUT", path: `/users/me/blocked-users/${userId}` }),

  unblock: (userId: number) => sendVoid({ method: "DELETE", path: `/users/me/blocked-users/${userId}` }),
};

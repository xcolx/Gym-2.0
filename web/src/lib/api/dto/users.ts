// Mirrors ios/Gym 2.0/Core/Networking/DTOs/UserDTOs.swift and backend/app/schemas/users.py

import type { UnitSystem } from "@/types/models";
import type { ISODateString } from "./common";

// MARK: - Responses

/**
 * A user profile. The optional fields are only included for the current user (the language also for friends,
 * the scheme color for everyone).
 */
export interface UserDTO {
  id: number;
  username: string;
  email: string | null;
  /** Image hash, served by GET /images/{hash}. Empty if the user has none. */
  profileImageUrl: string;
  profileIconUrl: string;
  /** In kilograms. */
  bodyweight: number | null;
  /** The app color as a hex code, e.g. "#FF0000". Null if the user never chose one. */
  schemeColor: string | null;
  weightUnit: UnitSystem | null;
  distanceUnit: UnitSystem | null;
  /** ISO 639-1 code, e.g. "en". */
  language: string | null;
  createdAt: ISODateString | null;
}

/** The result of an update. `success` is false if nothing had to be changed (e.g. the same username again). */
export interface UpdateResultDTO {
  success: boolean;
  message: string | null;
}

export interface ProfileImageDTO {
  success: boolean;
  /** Image hashes, served by GET /images/{hash}. */
  imageUrl: string | null;
  iconUrl: string | null;
  message: string | null;
}

export interface FriendRequestDTO {
  sender: UserDTO;
  timestamp: ISODateString;
}

export interface SentFriendRequestDTO {
  receiver: UserDTO;
  timestamp: ISODateString;
}

export interface FriendRequestAnswerDTO {
  success: boolean;
  message: string | null;
  /** The new friend, if the request was accepted. */
  newFriend: UserDTO | null;
}

// MARK: - Requests

/** Only the fields that are set are changed. */
export interface ProfileUpdate {
  /** In kilograms, above 0 and below 1000. */
  bodyweight?: number | null;
  /** Hex code, e.g. "#FF0000". */
  schemeColor?: string | null;
  weightUnit?: UnitSystem | null;
  distanceUnit?: UnitSystem | null;
  /** ISO 639-1 code, e.g. "en". */
  language?: string | null;
}

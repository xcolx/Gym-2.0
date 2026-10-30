// The settings (bodyweight, units, app color) are stored on the current user, so they can be changed offline and are
// pushed by the sync. The database always stores kilograms and meters: convert with lib/domain/units.

import { userFromDTO, profileUpdate, type UserDTO } from "@/lib/api";
import { DEFAULT_APP_COLOR } from "@/lib/app-color";
import type { GymDB } from "@/lib/db";
import type { UnitSystem, User } from "@/types/models";
import { changedState, write } from "./write";

/** The app color until the user picks one, as the server stores it (UserSettings.defaultColorHex) */
export const DEFAULT_SCHEME_COLOR = DEFAULT_APP_COLOR;

export function isHexColor(value: string | null | undefined): value is string {
  return !!value && /^#[0-9A-Fa-f]{6}$/.test(value);
}

/** Changes the current user and marks it for the sync, only if something changed (`UserSettings.update`) */
async function updateSettings(change: (user: User) => Partial<User>): Promise<void> {
  await write(
    (db) => [db.users],
    async (db) => {
      const user = await currentUserIn(db);
      // The settings can't be changed before the first sync loaded the current user
      if (!user) return;
      const updated = { ...user, ...change(user) };
      const before = profileUpdate(user);
      const after = profileUpdate(updated);
      const unchanged = (Object.keys(after) as (keyof typeof after)[]).every((key) => before[key] === after[key]);
      if (unchanged) return;
      await db.users.put({ ...updated, syncState: changedState(user.syncState) });
    },
  );
}

/** In kilograms, stored with one decimal like on the server */
export function setBodyweight(kilograms: number): Promise<void> {
  return updateSettings(() => ({ bodyweight: Math.round(kilograms * 10) / 10 }));
}

export function setWeightUnit(unit: UnitSystem): Promise<void> {
  return updateSettings(() => ({ weightUnit: unit }));
}

export function setDistanceUnit(unit: UnitSystem): Promise<void> {
  return updateSettings(() => ({ distanceUnit: unit }));
}

/** The app color as hex code, e.g. "#FF0000" (uppercase, as the server stores it) */
export function setSchemeColor(hex: string): Promise<void> {
  if (!isHexColor(hex)) return Promise.reject(new Error(`Invalid hex color: ${hex}`));
  return updateSettings(() => ({ schemeColor: hex.toUpperCase() }));
}

function currentUserIn(db: GymDB): Promise<User | undefined> {
  return db.users.filter((user) => user.isCurrentUser).first();
}

// MARK: - After online actions

/**
 * Stores a user the server returned, e.g. a new friend or a user found by username (`FriendActions.user(for:)`).
 * An existing row keeps its flags (isFriend, ...), `flags` changes them. The current user's offline settings that
 * weren't pushed yet are kept.
 */
export async function storeUser(dto: UserDTO, flags: Partial<Pick<User, "isFriend" | "isBlocked">> = {}): Promise<User> {
  return write(
    (db) => [db.users],
    async (db) => {
      const existing = await db.users.get(dto.id);
      const user = { ...userFromDTO(dto, existing, existing?.syncState !== "updated"), ...flags };
      await db.users.put(user);
      return user;
    },
    { sync: false },
  );
}

/**
 * Changes fields of a stored user after the server accepted the change, e.g. the username or the profile image of the
 * current user (AccountSettingsView), or isBlocked after (un)blocking (BlockedUsersView, FriendActions).
 * Not pushed: the change is already on the server.
 */
export async function updateStoredUser(
  serverId: number,
  changes: Partial<Pick<User, "username" | "profileImageUrl" | "profileIconUrl" | "email" | "isFriend" | "isBlocked">>,
): Promise<void> {
  await write(
    (db) => [db.users],
    async (db) => {
      await db.users.update(serverId, changes);
    },
    { sync: false },
  );
}

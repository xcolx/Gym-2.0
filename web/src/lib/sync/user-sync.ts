// Port of ios/Gym 2.0/Core/Services/Sync/UserSync.swift

import { errorMessage, isRejection, profileUpdate, userFromDTO, type UserDTO } from "@/lib/api";
import type { GymDB } from "@/lib/db";
import { currentUser } from "@/lib/repo/queries";
import type { User } from "@/types/models";
import type { SyncApi } from "./api";
import { logSync } from "./log";

const sameJSON = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export class UserSync {
  /** Chat members whose profile the server doesn't return (deleted, or they blocked the current user) */
  private unavailableMemberIds = new Set<number>();

  constructor(
    private readonly db: GymDB,
    private readonly api: SyncApi,
  ) {}

  // MARK: - Push

  /**
   * Returns a message to show if the server rejected the settings. The sync then replaces them by the server's right
   * away (`pull` or `pullCurrentUser`).
   */
  async pushSettings(): Promise<string | null> {
    const user = await currentUser(this.db);
    if (!user || user.syncState === "synced") return null;
    const sent = profileUpdate(user);
    try {
      await this.api.users.updateProfile(sent);
      await this.db.transaction("rw", this.db.users, async () => {
        const current = await this.db.users.get(user.serverId);
        if (current && sameJSON(profileUpdate(current), sent)) await this.db.users.put({ ...current, syncState: "synced" });
      });
      return null;
    } catch (error) {
      if (!isRejection(error)) throw error;
      logSync.error(`The server rejected the settings: ${errorMessage(error)}`);
      await this.db.transaction("rw", this.db.users, async () => {
        const current = await this.db.users.get(user.serverId);
        if (current) await this.db.users.put({ ...current, syncState: "synced" });
      });
      return `Your settings could not be saved: ${errorMessage(error)}`;
    }
  }

  // MARK: - Pull

  async pull(): Promise<void> {
    this.unavailableMemberIds = new Set();
    const me = await this.api.users.me();
    const friends = await this.api.friends.friends();
    const blocked = await this.api.friends.blockedUsers();

    const known = new Set<number>([
      ...(await this.db.users.toCollection().primaryKeys()),
      me.id,
      ...friends.map((user) => user.id),
      ...blocked.map((user) => user.id),
    ]);
    const members = await this.fetchMissingMembers(known);

    // The requests are done, the rest is one transaction
    await this.db.transaction("rw", [this.db.users, this.db.chatMembers], async () => {
      const local = new Map((await this.db.users.toArray()).map((user) => [user.serverId, user]));
      const next = new Map<number, User>();
      for (const user of local.values()) {
        next.set(user.serverId, { ...user, isCurrentUser: false, isFriend: false, isBlocked: false });
      }
      const upsert = (dto: UserDTO, includingSettings = true): User => {
        const user = userFromDTO(dto, next.get(dto.id), includingSettings);
        next.set(dto.id, user);
        return user;
      };

      // Settings changed offline are kept until they are pushed
      upsert(me, local.get(me.id)?.syncState !== "updated").isCurrentUser = true;
      for (const dto of friends) upsert(dto).isFriend = true;
      for (const dto of blocked) upsert(dto).isBlocked = true;
      for (const dto of members) upsert(dto);

      const memberIds = new Set((await this.db.chatMembers.toArray()).map((member) => member.userId));
      const removed: number[] = [];
      const changed: User[] = [];
      for (const user of next.values()) {
        if (!user.isCurrentUser && !user.isFriend && !user.isBlocked && !memberIds.has(user.serverId)) {
          if (local.has(user.serverId)) removed.push(user.serverId);
        } else if (!sameJSON(local.get(user.serverId), user)) {
          changed.push(user);
        }
      }
      if (removed.length > 0) await this.db.users.bulkDelete(removed);
      // Only what changed, every write re-renders the views that show users
      if (changed.length > 0) await this.db.users.bulkPut(changed);
    });
  }

  /**
   * Loads only the current user again, e.g. after the server rejected the settings and the sync doesn't pull: the
   * rejected values are replaced by the server's right away (settings changed again in the meantime are kept).
   */
  async pullCurrentUser(): Promise<void> {
    const me = await this.api.users.me();
    await this.db.transaction("rw", this.db.users, async () => {
      const local = await this.db.users.get(me.id);
      const user = userFromDTO(me, local, local?.syncState !== "updated");
      if (!sameJSON(local, { ...user, isCurrentUser: true })) await this.db.users.put({ ...user, isCurrentUser: true });
    });
  }

  /** Loads the chat members that aren't stored yet, e.g. after joining a group or when someone else joined one */
  async loadMissingMembers(): Promise<void> {
    const known = new Set(await this.db.users.toCollection().primaryKeys());
    const members = await this.fetchMissingMembers(known);
    if (members.length === 0) return;
    await this.db.transaction("rw", this.db.users, async () => {
      for (const dto of members) {
        const existing = await this.db.users.get(dto.id);
        await this.db.users.put(userFromDTO(dto, existing, existing?.syncState !== "updated"));
      }
    });
  }

  /**
   * Loads the profiles of the other members of a chat again and whether they are friends, e.g. every few seconds in
   * an open chat: the friends with one request, the other members one by one. A member the server doesn't return
   * (deleted, or blocked the current user) keeps the stored profile until the next full pull.
   */
  async refreshMembers(chatId: number): Promise<void> {
    const me = await currentUser(this.db);
    const memberIds = (await this.db.chatMembers.where("chatId").equals(chatId).toArray())
      .map((member) => member.userId)
      .filter((id) => id !== me?.serverId);
    if (memberIds.length === 0) return;
    const friendIds = new Set<number>();
    const loaded = new Map<number, UserDTO>();
    for (const dto of await this.api.friends.friends()) {
      friendIds.add(dto.id);
      loaded.set(dto.id, dto);
    }
    for (const id of memberIds) {
      if (loaded.has(id) || this.unavailableMemberIds.has(id)) continue;
      try {
        loaded.set(id, await this.api.users.user(id));
      } catch (error) {
        if (!isRejection(error)) throw error;
        logSync.info(`Chat member ${id} could not be loaded: ${errorMessage(error)}`);
        this.unavailableMemberIds.add(id);
      }
    }
    await this.db.transaction("rw", this.db.users, async () => {
      for (const id of memberIds) {
        const existing = await this.db.users.get(id);
        const dto = loaded.get(id);
        const base = dto ? userFromDTO(dto, existing) : existing;
        if (!base) continue;
        const user = { ...base, isFriend: friendIds.has(id) };
        // Only what changed, every write re-renders the views that show users
        if (!sameJSON(existing, user)) await this.db.users.put(user);
      }
    });
  }

  /** The profiles of the chat members that aren't in `known` */
  private async fetchMissingMembers(known: Set<number>): Promise<UserDTO[]> {
    const memberIds = new Set((await this.db.chatMembers.toArray()).map((member) => member.userId));
    const loaded: UserDTO[] = [];
    for (const id of memberIds) {
      if (known.has(id) || this.unavailableMemberIds.has(id)) continue;
      try {
        loaded.push(await this.api.users.user(id));
      } catch (error) {
        // e.g. a deleted account or a user that blocked the current user
        if (!isRejection(error)) throw error;
        logSync.info(`Chat member ${id} could not be loaded: ${errorMessage(error)}`);
        // Not requested again by every poll of the chats, only by the next full sync
        this.unavailableMemberIds.add(id);
      }
    }
    return loaded;
  }
}

import { describe, expect, it, vi } from "vitest";

import { makeChat, makeMembers, makeUserDTO } from "@/test/fixtures";
import type { ChatWithMembers } from "@/types/models";
import { chatInfoConfirmation, friendsConfirmation } from "./chat-confirmations";

const ME = 1;

function chat(overrides: Partial<ChatWithMembers> = {}): ChatWithMembers {
  return { ...makeChat({ serverId: 10 }), members: makeMembers(10, [ME, 2]), ...overrides };
}

function chatInfoActions() {
  return {
    removeFriend: vi.fn(),
    removeFromGroup: vi.fn(),
    leave: vi.fn(),
    delete: vi.fn(),
    block: vi.fn(),
    blockAndReport: vi.fn(),
  };
}

describe("chatInfoConfirmation", () => {
  it("is null without a confirmation", () => {
    expect(chatInfoConfirmation(null, chat(), ME, chatInfoActions())).toBeNull();
  });

  it("removes a friend", () => {
    const actions = chatInfoActions();
    const dialog = chatInfoConfirmation({ kind: "remove", id: 2, username: "bea" }, chat(), ME, actions);
    expect(dialog?.title).toBe("Remove bea as a friend?");
    expect(dialog?.buttons.map((button) => button.label)).toEqual(["Remove Friend"]);
    dialog?.buttons[0].onSelect();
    expect(actions.removeFriend).toHaveBeenCalledWith(2);
  });

  it("blocks, or blocks and reports", () => {
    const actions = chatInfoActions();
    const dialog = chatInfoConfirmation({ kind: "block", id: 2, username: "bea" }, chat(), ME, actions);
    expect(dialog?.title).toBe("Block bea?");
    expect(dialog?.message).toContain("direct chat with them is hidden");
    dialog?.buttons[0].onSelect();
    dialog?.buttons[1].onSelect();
    expect(actions.block).toHaveBeenCalledWith(2);
    expect(actions.blockAndReport).toHaveBeenCalledWith(2, "bea");
  });

  it("removes a member from the group", () => {
    const actions = chatInfoActions();
    const dialog = chatInfoConfirmation({ kind: "removeFromGroup", id: 2, username: "bea" }, chat(), ME, actions);
    expect(dialog?.title).toBe("Remove bea from the group?");
    dialog?.buttons[0].onSelect();
    expect(actions.removeFromGroup).toHaveBeenCalledWith(2);
  });

  it("leaves a group with the texts of leaveGroupConfirmation", () => {
    const actions = chatInfoActions();
    const dialog = chatInfoConfirmation({ kind: "leave" }, chat({ groupChat: true }), ME, actions);
    expect(dialog?.title).toBe("Leave the group?");
    expect(dialog?.message).toBe("Only an admin can add you again.");
    dialog?.buttons[0].onSelect();
    expect(actions.leave).toHaveBeenCalled();
  });

  it("deletes a direct chat or a group", () => {
    const direct = chatInfoConfirmation({ kind: "delete" }, chat(), ME, chatInfoActions());
    expect(direct?.title).toBe("Delete the chat?");
    expect(direct?.buttons[0].label).toBe("Delete Chat");
    const group = chatInfoConfirmation({ kind: "delete" }, chat({ groupChat: true }), ME, chatInfoActions());
    expect(group?.title).toBe("Delete the group?");
    expect(group?.message).toBe("The group and all its messages are deleted for all members.");
    expect(group?.buttons[0].label).toBe("Delete Group");
  });
});

describe("friendsConfirmation", () => {
  const actions = () => ({ removeFriend: vi.fn(), block: vi.fn(), blockAndReport: vi.fn() });

  it("is null without a confirmation", () => {
    expect(friendsConfirmation(null, actions())).toBeNull();
  });

  it("removes a friend", () => {
    const spies = actions();
    const dialog = friendsConfirmation({ kind: "remove", id: 3, username: "al" }, spies);
    expect(dialog?.title).toBe("Remove al as a friend?");
    dialog?.buttons[0].onSelect();
    expect(spies.removeFriend).toHaveBeenCalledWith(3);
  });

  it("blocks with the profile of the request, or blocks and reports", () => {
    const spies = actions();
    const profile = makeUserDTO({ id: 3, username: "al" });
    const dialog = friendsConfirmation({ kind: "block", id: 3, username: "al", profile }, spies);
    expect(dialog?.message).toContain("your chat with them is hidden");
    expect(dialog?.buttons.map((button) => button.label)).toEqual(["Block", "Block and Report…"]);
    dialog?.buttons[0].onSelect();
    dialog?.buttons[1].onSelect();
    expect(spies.block).toHaveBeenCalledWith(3, profile);
    expect(spies.blockAndReport).toHaveBeenCalledWith(3, "al", profile);
  });
});

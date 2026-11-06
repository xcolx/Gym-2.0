import { ProfileIcon } from "@/components/ui/ProfileIcon";
import type { UserDTO } from "@/lib/api";

/** PersonRow of FriendsView.swift: the picture and the username of a user from the server, with a line below */
export function PersonRow({ user, detail }: { user: UserDTO; detail: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <ProfileIcon hash={user.profileIconUrl} size={44} color={user.schemeColor} imageHash={user.profileImageUrl} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate font-medium">{user.username}</span>
        <span className="truncate text-caption1 text-secondary-label">{detail}</span>
      </span>
    </span>
  );
}

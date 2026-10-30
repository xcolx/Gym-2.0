"use client";

import { useEffect, useState } from "react";

import { friendApi } from "@/lib/api";

/** GET /users/friend-requests is limited to 30 requests per minute */
const FRIEND_REQUESTS_INTERVAL_MS = 30_000;

/** The number of friend requests for the dot on the friends button, loaded every 30 seconds while the list is shown */
export function useFriendRequestCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const requests = await friendApi.friendRequests();
        if (!cancelled) setCount(requests.length);
      } catch {
        // Offline or rate limited, the dot stays as it is
      }
    };
    void load();
    const timer = setInterval(load, FRIEND_REQUESTS_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return count;
}

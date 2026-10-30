"use client";

import { useState } from "react";

import { ActionSheet, type ActionSheetButton } from "@/components/ui/ActionSheet";

/** A long press on Android (and a right click) opens the actions of a row, like the context menus on iOS */
export function useContextMenu() {
  const [menu, setMenu] = useState<{ title: string; buttons: ActionSheetButton[] } | null>(null);
  const open = (title: string, buttons: ActionSheetButton[]) => (event: React.MouseEvent) => {
    event.preventDefault();
    setMenu({ title, buttons });
  };
  const sheet = (
    <ActionSheet open={menu !== null} title={menu?.title ?? ""} buttons={menu?.buttons ?? []} onClose={() => setMenu(null)} />
  );
  return { open, sheet };
}

export type OpenContextMenu = ReturnType<typeof useContextMenu>["open"];

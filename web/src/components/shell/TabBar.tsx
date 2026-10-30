"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartLine, Dumbbell, House, MessageCircle, Settings, type LucideIcon } from "lucide-react";

type Tab = { name: string; href: string; icon: LucideIcon; filled?: boolean };

// Same order and labels as the TabView in MainView.swift
const TABS: Tab[] = [
  { name: "Home", href: "/home", icon: House, filled: true },
  { name: "Chat", href: "/chat", icon: MessageCircle },
  { name: "Workout", href: "/workout", icon: Dumbbell },
  { name: "Stats", href: "/stats", icon: ChartLine },
  { name: "Settings", href: "/settings", icon: Settings },
];

/** A bottom tab bar on phones, a sidebar with the same items on wider screens */
export function TabBar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Phone / small tablet */}
      <nav
        aria-label="Tabs"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-separator bg-bar backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex h-[var(--tabbar-h)]">
          {TABS.map(({ name, href, icon: Icon, filled }) => {
            const active = isActive(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  className={`flex h-full flex-col items-center justify-center gap-0.5 pt-1 ${
                    active ? "text-app" : "text-tab-inactive"
                  }`}
                  aria-current={active ? "page" : undefined}
                  aria-label={name}
                >
                  <Icon size={25} strokeWidth={active ? 2.25 : 1.75} fill={active && filled ? "currentColor" : "none"} />
                  <span className="text-caption font-medium">{name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Laptop / desktop */}
      <nav aria-label="Tabs" className="fixed inset-y-0 left-0 z-50 hidden w-[var(--sidebar-w)] flex-col border-r border-separator bg-bar px-3 py-6 md:flex">
        <div className="mb-8 flex items-center gap-3 px-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" className="h-9 w-9 rounded-[9px]" />
          <span className="text-title2 font-bold">Gym 2.0</span>
        </div>
        <ul className="flex flex-col gap-1">
          {TABS.map(({ name, href, icon: Icon, filled }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-headline transition-colors ${
                    active ? "bg-field/40 text-app" : "text-foreground hover:bg-field/25"
                  }`}
                  aria-current={active ? "page" : undefined}
                  aria-label={name}
                >
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.25 : 1.75}
                    fill={active && filled ? "currentColor" : "none"}
                    className={active ? "" : "text-tab-inactive"}
                  />
                  {name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

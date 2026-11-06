"use client";

import {
  ArrowUpRight,
  ChevronRight,
  Code,
  Contrast,
  Download,
  FileText,
  Hand,
  Mail,
  Palette,
  PersonStanding,
  RefreshCw,
  Ruler,
  ScrollText,
  ShieldCheck,
  Weight,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Alert } from "@/components/ui/Alert";
import { AppColorSegmentedPicker } from "@/components/ui/AppColorSegmentedPicker";
import { FormRow, FormSection, LinkRow, PressableRow, SettingsLabel } from "@/components/ui/Form";
import { ProfileIcon } from "@/components/ui/ProfileIcon";
import { formatNumber, kilogramsFromWeight, weightFromKilograms, weightSymbol } from "@/lib/domain/units";
import { LICENSES_ROUTE, PRIVACY_ROUTE, TERMS_ROUTE } from "@/lib/auth/routes";
import { promptInstall, useInstallPrompt } from "@/lib/pwa/install-prompt";
import { setBodyweight, setDistanceUnit, setSchemeColor, setWeightUnit } from "@/lib/repo/user";
import type { UserSettingsValues } from "@/lib/repo/hooks";
import { APP_THEMES } from "@/lib/theme";
import { useSyncProblems, useSyncState } from "@/lib/sync";
import { useAppTheme } from "@/lib/use-app-theme";
import { UnitSystem, type User } from "@/types/models";

export const ACCOUNT_ROUTE = "/settings/account";
export const SYNC_ROUTE = "/settings/sync";
const BLOCKED_USERS_ROUTE = "/settings/blocked-users";

// MARK: - Account

/** AccountProfileLink of AccountSettingsView.swift: the card at the top with the profile image, which opens the account */
export function AccountCard({ user }: { user: User }) {
  return (
    <FormSection>
      <Link href={ACCOUNT_ROUTE} className="flex items-center gap-3.5 px-4 py-3 hover:bg-field/15 active:bg-field/40">
        {/* Not a button of its own: the whole card opens the account */}
        <span className="pointer-events-none">
          <ProfileIcon hash={user.profileIconUrl} size={60} color={user.schemeColor} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-title3 font-semibold">{user.username}</span>
          <span className="text-subheadline text-secondary-label">Account, password and data</span>
        </span>
        <ChevronRight size={18} strokeWidth={2.5} className="-mr-1 shrink-0 text-tab-inactive/70" aria-hidden />
      </Link>
    </FormSection>
  );
}

// MARK: - Training

/** The training section of SettingsView.swift: the bodyweight and the units */
export function TrainingSection({ settings }: { settings: UserSettingsValues }) {
  return (
    <FormSection header="Training" footer="Your bodyweight is used as the weight of bodyweight exercises.">
      <BodyweightRow settings={settings} />
      <UnitRow
        title="Weight"
        icon={Weight}
        metric="kg"
        imperial="lbs"
        value={settings.weightUnit}
        onChange={(unit) => void setWeightUnit(unit)}
      />
      <UnitRow
        title="Distance"
        icon={Ruler}
        metric="m"
        imperial="ft"
        value={settings.distanceUnit}
        onChange={(unit) => void setDistanceUnit(unit)}
      />
    </FormSection>
  );
}

/** BodyweightRow of SettingsView.swift: in the unit of the user, saved while typing if valid */
function BodyweightRow({ settings }: { settings: UserSettingsValues }) {
  const unit = settings.weightUnit;
  // What the user typed, null while not editing: the stored value is shown then (also after a pull)
  const [draft, setDraft] = useState<string | null>(null);
  const stored = settings.bodyweight === null ? "" : formatNumber(weightFromKilograms(settings.bodyweight, unit), 1);
  const text = draft ?? stored;

  // The server takes 0 < kg < 1000
  const value = Number(text);
  const kilograms = kilogramsFromWeight(value, unit);
  const isValid = text === "" || (text !== "." && Number.isFinite(value) && kilograms > 0 && kilograms < 1000);

  const change = (next: string) => {
    const normalized = next.replace(",", ".");
    if (!/^\d*\.?\d*$/.test(normalized)) return;
    setDraft(normalized);
    const nextKilograms = kilogramsFromWeight(Number(normalized), unit);
    if (normalized !== "" && normalized !== "." && nextKilograms > 0 && nextKilograms < 1000) void setBodyweight(nextKilograms);
  };

  return (
    <FormRow className="flex-col items-stretch gap-1" rowClassName="focus-ring-within rounded-[20px]">
      <span className="flex items-center gap-3">
        <label htmlFor="bodyweight" className="flex-1">
          <SettingsLabel icon={PersonStanding} title="Bodyweight" />
        </label>
        <input
          id="bodyweight"
          aria-label={`Bodyweight in ${weightSymbol(unit)}`}
          value={text}
          placeholder="–"
          onChange={(event) => change(event.target.value)}
          onBlur={() => setDraft(null)}
          inputMode="decimal"
          className={`w-20 bg-transparent text-right outline-none placeholder:text-[var(--placeholder)] ${isValid ? "" : "text-[#ff3b30]"}`}
        />
        <span className="text-secondary-label">{weightSymbol(unit)}</span>
      </span>
      {!isValid && (
        <span className="text-footnote text-[#ff3b30]">
          Enter a weight between 0 and {formatNumber(weightFromKilograms(1000, unit), 0)} {weightSymbol(unit)}.
        </span>
      )}
    </FormRow>
  );
}

function UnitRow({
  title,
  icon,
  metric,
  imperial,
  value,
  onChange,
}: {
  title: string;
  icon: LucideIcon;
  metric: string;
  imperial: string;
  value: UnitSystem;
  onChange: (unit: UnitSystem) => void;
}) {
  return (
    <FormRow className="py-1.5">
      <span className="flex-1">
        <SettingsLabel icon={icon} title={title} />
      </span>
      <AppColorSegmentedPicker
        label={title}
        options={[UnitSystem.metric, UnitSystem.imperial]}
        selection={value}
        title={(unit) => (unit === UnitSystem.metric ? metric : imperial)}
        onChange={onChange}
        className="w-[120px]"
      />
    </FormRow>
  );
}

// MARK: - Appearance

/** A choice of colors that work as the app color (AppColorSwatches of SettingsView.swift) */
const APP_COLOR_PRESETS = ["#FF0000", "#FF9500", "#FFCC00", "#34C759", "#00C7BE", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55"];

/**
 * The appearance section of SettingsView.swift: the app color, which can only be changed once the first sync loaded
 * the current user, and the theme, which is only stored on this device and can always be changed
 */
export function AppearanceSection({ settings }: { settings: UserSettingsValues }) {
  const [theme, setTheme] = useAppTheme();
  return (
    <FormSection header="Appearance">
      <fieldset disabled={!settings.isAvailable} className={`min-w-0 ${settings.isAvailable ? "" : "opacity-40"}`}>
        <FormRow className="flex-col items-stretch gap-3 py-3.5">
          <SettingsLabel icon={Palette} title="App color" />
          <AppColorSwatches color={settings.schemeColor} />
        </FormRow>
      </fieldset>
      <FormRow className="py-1.5">
        <span className="flex-1">
          <SettingsLabel icon={Contrast} title="Theme" />
        </span>
        <AppColorSegmentedPicker
          label="Theme"
          options={APP_THEMES.map((option) => option.value)}
          selection={theme}
          title={(value) => APP_THEMES.find((option) => option.value === value)?.title ?? value}
          onChange={setTheme}
          className="w-[190px]"
        />
      </FormRow>
    </FormSection>
  );
}

/** The presets and the color picker of the browser for any other color, with a ring around the chosen one */
function AppColorSwatches({ color }: { color: string }) {
  const selected = color.toUpperCase();
  const isCustom = !APP_COLOR_PRESETS.includes(selected);
  const ring = "ring-2 ring-foreground/80 ring-inset";
  return (
    <div role="radiogroup" aria-label="App color" className="flex justify-between">
      {APP_COLOR_PRESETS.map((hex) => (
        <button
          key={hex}
          type="button"
          role="radio"
          aria-checked={hex === selected}
          aria-label={hex}
          onClick={() => void setSchemeColor(hex)}
          className={`flex size-8 items-center justify-center rounded-full transition-transform hover:scale-110 ${hex === selected ? ring : ""}`}
        >
          <span className="size-[26px] rounded-full" style={{ backgroundColor: hex }} />
        </button>
      ))}
      {/* Any other color, with a ring like the selected presets while one is chosen */}
      <label
        className={`relative flex size-8 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 ${isCustom ? ring : ""}`}
        title="Other color"
      >
        <span
          className="size-[26px] rounded-full p-[3px]"
          style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
        >
          <span className="block size-full rounded-full border-2 border-cell" style={{ background: isCustom ? color : "var(--cell-bg)" }} />
        </span>
        <input
          type="color"
          aria-label="Other color"
          value={color.toLowerCase()}
          onChange={(event) => void setSchemeColor(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

// MARK: - Privacy and data

/** The privacy section of SettingsView.swift: the blocked users and the state of the sync */
export function PrivacySection({ blockedUsersCount, disabled }: { blockedUsersCount: number; disabled: boolean }) {
  return (
    <FormSection header="Privacy and data">
      {disabled ? (
        <FormRow className="opacity-40">
          <span className="flex-1">
            <SettingsLabel icon={Hand} title="Blocked users" />
          </span>
          <span className="text-secondary-label">{blockedUsersCount}</span>
        </FormRow>
      ) : (
        <LinkRow
          href={BLOCKED_USERS_ROUTE}
          label={<SettingsLabel icon={Hand} title="Blocked users" />}
          value={String(blockedUsersCount)}
        />
      )}
      <LinkRow href={SYNC_ROUTE} label={<SettingsLabel icon={RefreshCw} title="Sync" />} value={<SyncStatusText withProblems />} />
    </FormSection>
  );
}

/** The state of the sync, the failure and (`withProblems`) the number of problems in red */
export function SyncStatusText({ withProblems = false }: { withProblems?: boolean }) {
  const { state } = useSyncState();
  const problems = useSyncProblems();
  if (withProblems && problems.length > 0) {
    return <span className="text-[#ff3b30]">{problems.length === 1 ? "1 problem" : `${problems.length} problems`}</span>;
  }
  switch (state) {
    case "idle":
      return <>Up to date</>;
    case "syncing":
      return <>Syncing…</>;
    case "failed":
      return <span className="text-[#ff3b30]">Failed</span>;
  }
}

// MARK: - Install (web only)

/** Android: installs the web app on the home screen, while the browser offers it */
export function InstallSection() {
  const { canInstall } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <FormSection footer="Adds Gym 2.0 to your home screen. It opens like an app and works offline.">
      <PressableRow onClick={() => void promptInstall()}>
        <SettingsLabel icon={Download} title="Install app" />
      </PressableRow>
    </FormSection>
  );
}

// MARK: - About

const DEVELOPER_EMAIL = "gym2@colinrueegg.com";
const SOURCE_CODE_URL = "https://github.com/xcolx/Gym-2.0";

/**
 * AboutSection of SettingsView.swift. The email and the source code leave the app, so they ask first. The legal pages
 * are part of the web app and open in a tab of their own, since they have no tab bar to come back with.
 */
export function AboutSection() {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const openInTab = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
  return (
    <>
      <FormSection header="About">
        <ExternalRow icon={Mail} title="Contact and feedback" onClick={() => setPendingUrl(`mailto:${DEVELOPER_EMAIL}`)} />
        <ExternalRow icon={Code} title="Source code" onClick={() => setPendingUrl(SOURCE_CODE_URL)} />
        <ExternalRow icon={FileText} title="Terms of use" onClick={() => openInTab(TERMS_ROUTE)} />
        <ExternalRow icon={ShieldCheck} title="Privacy policy" onClick={() => openInTab(PRIVACY_ROUTE)} />
        {/* Web only: the iOS app contains no third-party packages */}
        <ExternalRow icon={ScrollText} title="Third-party licenses" onClick={() => openInTab(LICENSES_ROUTE)} />
      </FormSection>
      <Alert
        open={pendingUrl !== null}
        title="Leave Gym 2.0?"
        message={
          pendingUrl?.startsWith("mailto:")
            ? `This opens your mail app to write an email to ${DEVELOPER_EMAIL}.`
            : "This opens the page in a new tab."
        }
        onClose={() => setPendingUrl(null)}
        buttons={[
          {
            label: "Open",
            isDefault: true,
            onSelect: () => {
              if (!pendingUrl) return;
              if (pendingUrl.startsWith("mailto:")) window.location.href = pendingUrl;
              else openInTab(pendingUrl);
            },
          },
          { label: "Cancel", role: "cancel" },
        ]}
      />
    </>
  );
}

/** LinkRow of SettingsView.swift: a row that opens something outside of the settings, with an arrow */
function ExternalRow({ icon, title, onClick }: { icon: LucideIcon; title: ReactNode; onClick: () => void }) {
  return (
    <PressableRow onClick={onClick}>
      <span className="flex-1">
        <SettingsLabel icon={icon} title={title} />
      </span>
      <ArrowUpRight size={16} strokeWidth={2.5} className="shrink-0 text-tab-inactive/70" aria-hidden />
    </PressableRow>
  );
}

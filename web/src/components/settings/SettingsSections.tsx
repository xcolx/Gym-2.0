"use client";

import { ChevronsUpDown, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { SegmentedPicker } from "@/components/ui/controls";
import { ButtonRow, FormRow, FormSection, LabeledRow, LinkRow } from "@/components/ui/Form";
import { formatNumber, kilogramsFromWeight, weightFromKilograms, weightSymbol } from "@/lib/domain/units";
import { LICENSES_ROUTE, PRIVACY_ROUTE, TERMS_ROUTE } from "@/lib/auth/routes";
import { promptInstall, useInstallPrompt } from "@/lib/pwa/install-prompt";
import { setBodyweight, setDistanceUnit, setSchemeColor, setWeightUnit } from "@/lib/repo/user";
import type { UserSettingsValues } from "@/lib/repo/hooks";
import { APP_THEMES, type AppTheme } from "@/lib/theme";
import { resync, syncStore, useSyncProblems } from "@/lib/sync";
import { useAppTheme } from "@/lib/use-app-theme";
import { UnitSystem } from "@/types/models";

const BLOCKED_USERS_ROUTE = "/settings/blocked-users";
const SYNC_PROBLEMS_ROUTE = "/settings/sync-problems";

// MARK: - Bodyweight

/** BodyweightSection of SettingsView.swift: in the unit of the user, saved while typing if valid */
export function BodyweightSection({ settings }: { settings: UserSettingsValues }) {
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
    <FormSection
      footer={
        isValid ? (
          "Used as the weight of bodyweight exercises."
        ) : (
          <span className="text-[#ff3b30]">
            Enter a weight between 0 and {formatNumber(weightFromKilograms(1000, unit), 0)} {weightSymbol(unit)}.
          </span>
        )
      }
    >
      <FormRow rowClassName="focus-ring-within rounded-[10px]">
        <label htmlFor="bodyweight" className="flex-1">
          Bodyweight
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
      </FormRow>
    </FormSection>
  );
}

// MARK: - Units

export function UnitsSection({ settings }: { settings: UserSettingsValues }) {
  return (
    <FormSection header="Units">
      <UnitRow
        title="Weight"
        metric="kg"
        imperial="lbs"
        value={settings.weightUnit}
        onChange={(unit) => void setWeightUnit(unit)}
      />
      <UnitRow
        title="Distance"
        metric="m"
        imperial="ft"
        value={settings.distanceUnit}
        onChange={(unit) => void setDistanceUnit(unit)}
      />
    </FormSection>
  );
}

function UnitRow({
  title,
  metric,
  imperial,
  value,
  onChange,
}: {
  title: string;
  metric: string;
  imperial: string;
  value: UnitSystem;
  onChange: (unit: UnitSystem) => void;
}) {
  return (
    <FormRow className="py-1.5">
      <span className="flex-1">{title}</span>
      <SegmentedPicker
        label={title}
        value={value}
        options={[
          { value: UnitSystem.metric, title: metric },
          { value: UnitSystem.imperial, title: imperial },
        ]}
        onChange={onChange}
        className="w-[140px]"
      />
    </FormRow>
  );
}

// MARK: - App color

/** `ColorPicker("App Color")`: the color well opens the color picker of the browser */
export function AppColorSection({ settings }: { settings: UserSettingsValues }) {
  return (
    <FormSection>
      <FormRow className="py-1.5">
        <label htmlFor="app-color" className="flex-1">
          App Color
        </label>
        <span
          className="relative h-7 w-7 rounded-full p-[3px]"
          style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
        >
          <span className="block h-full w-full rounded-full border-2 border-cell" style={{ background: settings.schemeColor }} />
          <input
            id="app-color"
            type="color"
            value={settings.schemeColor.toLowerCase()}
            onChange={(event) => void setSchemeColor(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
          />
        </span>
      </FormRow>
    </FormSection>
  );
}

// MARK: - Blocked users

export function BlockedUsersSection({ count, disabled }: { count: number; disabled: boolean }) {
  return (
    <FormSection>
      {disabled ? (
        <div className="opacity-40">
          <LabeledRow label="Blocked Users" value={String(count)} />
        </div>
      ) : (
        <LinkRow href={BLOCKED_USERS_ROUTE} label="Blocked Users" value={String(count)} />
      )}
    </FormSection>
  );
}

// MARK: - Appearance

/** `Picker("Appearance")` in the menu style. Only stored on this device, so it can always be changed. */
export function AppearanceSection() {
  const [theme, setTheme] = useAppTheme();
  return (
    <FormSection>
      <FormRow>
        <label htmlFor="appearance" className="flex-1">
          Appearance
        </label>
        <span className="relative flex items-center gap-1 text-secondary-label">
          {APP_THEMES.find((option) => option.value === theme)?.title}
          <ChevronsUpDown size={15} aria-hidden />
          <select
            id="appearance"
            value={theme}
            onChange={(event) => setTheme(event.target.value as AppTheme)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {APP_THEMES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.title}
              </option>
            ))}
          </select>
        </span>
      </FormRow>
    </FormSection>
  );
}

// MARK: - Manual resync

/**
 * ResyncSection of SettingsView.swift: "Manual Resync" and, only while something is out of sync, the link to the sync
 * problems with their count.
 */
export function ResyncSection() {
  const problems = useSyncProblems();
  const [isResyncing, setIsResyncing] = useState(false);
  const [didFinish, setDidFinish] = useState(false);
  /** The failure of the resync, null if it succeeded */
  const [failure, setFailure] = useState<string | null>(null);

  const start = async () => {
    setIsResyncing(true);
    setDidFinish(false);
    await resync();
    const status = syncStore.get();
    setFailure(status.state === "failed" ? status.failureMessage : null);
    setIsResyncing(false);
    setDidFinish(true);
  };

  return (
    <FormSection
      footer={
        didFinish && failure !== null ? (
          <span className="text-[#ff3b30]">The resync failed: {failure}</span>
        ) : didFinish ? (
          "Everything was reloaded from the server."
        ) : (
          "Uploads all changes that are not on the server yet and then loads everything again. Use it if something seems out of sync."
        )
      }
    >
      <ButtonRow onClick={() => void start()} disabled={isResyncing} isLoading={isResyncing}>
        Manual Resync
      </ButtonRow>
      {problems.length > 0 && (
        <LinkRow
          href={SYNC_PROBLEMS_ROUTE}
          label={
            <span className="flex items-center gap-2 text-[#ff3b30]">
              <TriangleAlert size={18} fill="currentColor" stroke="var(--cell-bg)" aria-hidden />
              Sync Problems
            </span>
          }
          value={<span className="text-[#ff3b30]">{problems.length}</span>}
        />
      )}
    </FormSection>
  );
}

// MARK: - Install (web only)

/** Android: installs the web app on the home screen, while the browser offers it */
export function InstallSection() {
  const { canInstall } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <FormSection footer="Adds Gym 2.0 to your home screen. It opens like an app and works offline.">
      <ButtonRow onClick={() => void promptInstall()}>Install App</ButtonRow>
    </FormSection>
  );
}

// MARK: - About the developer

const DEVELOPER_EMAIL = "gym2@colinrueegg.com";
const SOURCE_CODE_URL = "https://github.com/xcolx/Gym-2.0";

/** AboutDeveloperSection of SettingsView.swift: asks before leaving the app */
export function AboutDeveloperSection() {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  return (
    <>
      <FormSection header="About the Developer" footer="Questions, feedback, bugs or suggestions? Send me an email.">
        <div className="text-footnote">
          <ButtonRow onClick={() => setPendingUrl("https://github.com/xcolx")}>
            <span className="flex justify-between gap-3">
              GitHub <span className="text-secondary-label">xcolx</span>
            </span>
          </ButtonRow>
          <ButtonRow onClick={() => setPendingUrl(SOURCE_CODE_URL)}>
            <span className="flex justify-between gap-3">
              Source Code <span className="text-secondary-label">Gym-2.0</span>
            </span>
          </ButtonRow>
          <ButtonRow onClick={() => setPendingUrl(`mailto:${DEVELOPER_EMAIL}`)}>
            <span className="flex justify-between gap-3">
              Email <span className="truncate text-secondary-label">{DEVELOPER_EMAIL}</span>
            </span>
          </ButtonRow>
          {/* Tabs of their own, like the links of the sign up: the legal pages have no tab bar to come back with */}
          <ButtonRow onClick={() => window.open(TERMS_ROUTE, "_blank", "noopener,noreferrer")}>Terms of Use</ButtonRow>
          <ButtonRow onClick={() => window.open(PRIVACY_ROUTE, "_blank", "noopener,noreferrer")}>Privacy Policy</ButtonRow>
          {/* Web only: the iOS app contains no third-party packages */}
          <ButtonRow onClick={() => window.open(LICENSES_ROUTE, "_blank", "noopener,noreferrer")}>
            Third-Party Licenses
          </ButtonRow>
        </div>
      </FormSection>
      <Alert
        open={pendingUrl !== null}
        title="Leave Gym 2.0?"
        message="Do you want to open this link and leave the app?"
        onClose={() => setPendingUrl(null)}
        buttons={[
          {
            label: "Yes",
            isDefault: true,
            onSelect: () => {
              if (!pendingUrl) return;
              if (pendingUrl.startsWith("mailto:")) window.location.href = pendingUrl;
              else window.open(pendingUrl, "_blank", "noopener,noreferrer");
            },
          },
          { label: "Cancel", role: "cancel" },
        ]}
      />
    </>
  );
}

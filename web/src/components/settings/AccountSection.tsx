"use client";

import { Download, Key, Mail, User as UserIcon } from "lucide-react";
import { useRef, useState } from "react";

import { ActionSheet } from "@/components/ui/ActionSheet";
import { afterOverlayClose } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/controls";
import { ButtonRow, FormSection, LinkRow, PressableRow, SettingsLabel } from "@/components/ui/Form";
import { ProfileIcon } from "@/components/ui/ProfileIcon";
import { loadImage, ProfileImageCrop } from "./ProfileImageCrop";
import { downloadFile } from "@/components/stats/share";
import { errorMessage, userApi } from "@/lib/api";
import { deleteAccount, logout, refreshCurrentUser, UNPUSHED_CHANGES_MESSAGE } from "@/lib/auth";
import { removeProfileImage, uploadProfileImage } from "@/lib/repo/settings-feature";
import type { User } from "@/types/models";

const ACCOUNT_ROUTES = {
  username: "/settings/account/username",
  email: "/settings/account/email",
  password: "/settings/account/password",
} as const;

// The account of the current user (AccountSettingsView.swift). Unlike the other settings, these changes need a
// connection.

/**
 * AccountView of AccountSettingsView.swift: profile image, username, email, password, the data takeout and deleting the
 * account
 */
export function AccountSections({ user }: { user: User }) {
  const [showsDeleteConfirmation, setShowsDeleteConfirmation] = useState(false);
  const [showsFinalDeleteConfirmation, setShowsFinalDeleteConfirmation] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloadingTakeout, setIsDownloadingTakeout] = useState(false);
  const [takeoutError, setTakeoutError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /**
   * Downloads all data the server stores about the account as a ZIP file (data.json and the images). Unlike on iOS,
   * where the file is shared from a page of its own, the browser saves it right away.
   */
  const downloadTakeout = async () => {
    setIsDownloadingTakeout(true);
    setTakeoutError(null);
    try {
      const blob = await userApi.dataTakeout();
      // The local date, e.g. "2026-10-20" (toISOString would be the UTC date)
      const now = new Date();
      const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
      downloadFile(new File([blob], `Gym 2.0 Data Takeout ${date}.zip`, { type: "application/zip" }));
    } catch (caught) {
      setTakeoutError(errorMessage(caught));
    } finally {
      setIsDownloadingTakeout(false);
    }
  };

  const canDelete = deletePassword.length >= 8;

  const doDeleteAccount = async () => {
    const password = deletePassword;
    setDeletePassword("");
    setIsDeleting(true);
    setDeleteError(null);
    try {
      // Ends the session and removes the data of the account from this device
      await deleteAccount(password);
    } catch (caught) {
      setDeleteError(errorMessage(caught));
      setIsDeleting(false);
    }
  };

  return (
    <>
      <FormSection plain>
        <ProfileImageRow user={user} />
      </FormSection>

      <FormSection>
        <LinkRow
          href={ACCOUNT_ROUTES.username}
          label={<SettingsLabel icon={UserIcon} title="Username" />}
          value={user.username}
        />
        <LinkRow href={ACCOUNT_ROUTES.email} label={<SettingsLabel icon={Mail} title="Email" />} value={user.email ?? ""} />
        <LinkRow href={ACCOUNT_ROUTES.password} label={<SettingsLabel icon={Key} title="Password" />} />
      </FormSection>

      <FormSection
        footer={
          takeoutError ? (
            <span className="text-[#ff3b30]">{takeoutError}</span>
          ) : (
            "Download a copy of everything Gym 2.0 stores about you as a ZIP file."
          )
        }
      >
        <PressableRow disabled={isDownloadingTakeout} onClick={() => void downloadTakeout()}>
          <span className="flex-1">
            <SettingsLabel icon={Download} title="Download your data" />
          </span>
          {isDownloadingTakeout && <Spinner />}
        </PressableRow>
      </FormSection>

      <FormSection footer={deleteError && <span className="text-[#ff3b30]">{deleteError}</span>}>
        <ButtonRow
          destructive
          centered
          disabled={isDeleting}
          isLoading={isDeleting}
          onClick={() => setShowsDeleteConfirmation(true)}
        >
          Delete account
        </ButtonRow>
      </FormSection>

      <Alert
        open={showsDeleteConfirmation}
        title="Delete your account?"
        message="You will be logged out and can't log in with this account anymore."
        onClose={() => setShowsDeleteConfirmation(false)}
        buttons={[
          {
            label: "Delete",
            role: "destructive",
            onSelect: () => {
              setDeletePassword("");
              setShowsFinalDeleteConfirmation(true);
            },
          },
          { label: "Cancel", role: "cancel" },
        ]}
      />
      {/* A second step, so that no account is deleted by mistake. Delete on the left, unlike the first alert, so
          that tapping the same spot twice doesn't delete. */}
      <Alert
        open={showsFinalDeleteConfirmation}
        title="Are you sure?"
        message="All of your progress and all data stored on Gym 2.0 will be deleted: your workouts, workout schemes, exercises, stats, chats, friends and your profile. This can't be undone. Enter your password to confirm."
        onClose={() => setShowsFinalDeleteConfirmation(false)}
        buttons={[
          { label: "Delete", role: "destructive", disabled: !canDelete, onSelect: () => void doDeleteAccount() },
          { label: "Cancel", isDefault: true },
        ]}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canDelete) return;
            setShowsFinalDeleteConfirmation(false);
            afterOverlayClose(() => void doDeleteAccount());
          }}
        >
          <input
            autoFocus
            type="password"
            name="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
            placeholder="Password"
            aria-label="Password"
            className="w-full rounded-[7px] border border-separator bg-background px-2 py-1.5 text-[15px] outline-none focus:border-app"
          />
        </form>
      </Alert>
    </>
  );
}

// MARK: - Logout

/** LogoutSection of AccountSettingsView.swift: the logout at the end of the settings, which warns about changes that aren't uploaded yet */
export function LogoutSection() {
  const [showsConfirmation, setShowsConfirmation] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showsUnpushedChanges, setShowsUnpushedChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Uploads the local changes first. If some can't be uploaded, the user decides whether to log out anyway. */
  const doLogout = async (force: boolean) => {
    setIsLoggingOut(true);
    setError(null);
    try {
      const result = await logout({ force });
      if (!result.loggedOut) setShowsUnpushedChanges(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      <FormSection footer={error && <span className="text-[#ff3b30]">{error}</span>}>
        <ButtonRow
          destructive
          centered
          disabled={isLoggingOut}
          isLoading={isLoggingOut}
          onClick={() => setShowsConfirmation(true)}
        >
          Log out
        </ButtonRow>
      </FormSection>

      <ActionSheet
        open={showsConfirmation}
        title="Log out?"
        onClose={() => setShowsConfirmation(false)}
        buttons={[{ label: "Log out", destructive: true, onSelect: () => void doLogout(false) }]}
      />
      <Alert
        open={showsUnpushedChanges}
        title="Not everything is uploaded"
        message={UNPUSHED_CHANGES_MESSAGE}
        onClose={() => setShowsUnpushedChanges(false)}
        buttons={[
          { label: "Try again", onSelect: () => void doLogout(false) },
          { label: "Log out anyway", role: "destructive", onSelect: () => void doLogout(true) },
          { label: "Cancel", role: "cancel" },
        ]}
      />
    </>
  );
}

// MARK: - Profile image

/**
 * ProfileImageRow: the full image, centered, with the buttons to pick a new one, which the user crops
 * (ProfileImageCropView) before it's uploaded, and to remove it
 */
function ProfileImageRow({ user }: { user: User }) {
  const input = useRef<HTMLInputElement>(null);
  const [imageToCrop, setImageToCrop] = useState<HTMLImageElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picked = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    setError(null);
    const image = await loadImage(file);
    if (image) setImageToCrop(image);
    else setError("The image could not be loaded.");
  };

  const closeCrop = () => {
    if (imageToCrop) URL.revokeObjectURL(imageToCrop.src);
    setImageToCrop(null);
  };

  const upload = async (jpeg: Blob) => {
    closeCrop();
    setIsUploading(true);
    setError(null);
    try {
      await uploadProfileImage(user.serverId, { data: jpeg, filename: "image.jpg", mimeType: "image/jpeg" });
      await refreshCurrentUser().catch(() => undefined);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsUploading(false);
    }
  };

  const remove = async () => {
    setIsUploading(true);
    setError(null);
    try {
      await removeProfileImage(user.serverId);
      await refreshCurrentUser().catch(() => undefined);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsUploading(false);
    }
  };

  const textButton = "font-medium active:opacity-50 enabled:hover:underline disabled:opacity-40";
  return (
    <div className="flex flex-col items-center gap-3">
      {/* The full image, the icon would be blurry at this size */}
      <ProfileIcon
        hash={user.profileImageUrl}
        size={104}
        color={user.schemeColor}
        imageHash={user.profileImageUrl}
        overlay={isUploading ? <Spinner className="text-white" /> : undefined}
      />
      <div className="flex gap-5">
        <button type="button" disabled={isUploading} onClick={() => input.current?.click()} className={`text-app ${textButton}`}>
          {user.profileImageUrl ? "Change photo" : "Add photo"}
        </button>
        {user.profileImageUrl && (
          <button
            type="button"
            disabled={isUploading}
            onClick={() => void remove()}
            className={`text-[#ff3b30] dark:text-[#ff453a] ${textButton}`}
          >
            Remove
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void picked(event.target.files?.[0])}
      />
      {error && <p className="text-center text-footnote text-[#ff3b30]">{error}</p>}
      {imageToCrop && <ProfileImageCrop image={imageToCrop} onCancel={closeCrop} onChoose={(jpeg) => void upload(jpeg)} />}
    </div>
  );
}

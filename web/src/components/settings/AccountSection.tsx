"use client";

import { useRef, useState } from "react";

import { ActionSheet } from "@/components/ui/ActionSheet";
import { afterOverlayClose } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/controls";
import { ButtonRow, FormRow, FormSection, LinkRow } from "@/components/ui/Form";
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

/**
 * Port of AccountSection (AccountSettingsView.swift). Unlike the other settings these changes need a connection.
 */
export function AccountSection({ user }: { user: User }) {
  const [showsLogoutConfirmation, setShowsLogoutConfirmation] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showsUnpushedChanges, setShowsUnpushedChanges] = useState(false);
  const [showsDeleteConfirmation, setShowsDeleteConfirmation] = useState(false);
  const [showsFinalDeleteConfirmation, setShowsFinalDeleteConfirmation] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloadingTakeout, setIsDownloadingTakeout] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Downloads all data the server stores about the account as a ZIP file (data.json and the images) */
  const downloadTakeout = async () => {
    setIsDownloadingTakeout(true);
    setError(null);
    try {
      const blob = await userApi.dataTakeout();
      // The local date, e.g. "2026-10-20" (toISOString would be the UTC date)
      const now = new Date();
      const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
      downloadFile(new File([blob], `Gym 2.0 Data Takeout ${date}.zip`, { type: "application/zip" }));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsDownloadingTakeout(false);
    }
  };

  /** Uploads the local changes first. If some can't be uploaded, the user decides whether to log out anyway. */
  const doLogout = async (force: boolean) => {
    setIsLoggingOut(true);
    try {
      const result = await logout({ force });
      if (!result.loggedOut) setShowsUnpushedChanges(true);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const canDelete = deletePassword.length >= 8;

  const doDeleteAccount = async () => {
    const password = deletePassword;
    setDeletePassword("");
    setIsDeleting(true);
    setError(null);
    try {
      // Ends the session and removes the data of the account from this device
      await deleteAccount(password);
    } catch (caught) {
      setError(errorMessage(caught));
      setIsDeleting(false);
    }
  };

  return (
    <>
      <FormSection header="Account" footer={error && <span className="text-[#ff3b30]">{error}</span>}>
        <ProfileImageRow user={user} />
        <LinkRow href={ACCOUNT_ROUTES.username} label="Username" value={user.username} />
        <LinkRow href={ACCOUNT_ROUTES.email} label="Email" value={user.email ?? ""} />
        <LinkRow href={ACCOUNT_ROUTES.password} label="Password" />
        <ButtonRow disabled={isDownloadingTakeout} isLoading={isDownloadingTakeout} onClick={() => void downloadTakeout()}>
          Data Takeout
        </ButtonRow>
        <ButtonRow disabled={isLoggingOut} isLoading={isLoggingOut} onClick={() => setShowsLogoutConfirmation(true)}>
          Log Out
        </ButtonRow>
        <ButtonRow destructive disabled={isDeleting} isLoading={isDeleting} onClick={() => setShowsDeleteConfirmation(true)}>
          Delete Account
        </ButtonRow>
      </FormSection>

      <ActionSheet
        open={showsLogoutConfirmation}
        title="Log out?"
        onClose={() => setShowsLogoutConfirmation(false)}
        buttons={[{ label: "Log Out", destructive: true, onSelect: () => void doLogout(false) }]}
      />
      <Alert
        open={showsUnpushedChanges}
        title="Not everything is uploaded"
        message={UNPUSHED_CHANGES_MESSAGE}
        onClose={() => setShowsUnpushedChanges(false)}
        buttons={[
          { label: "Try Again", onSelect: () => void doLogout(false) },
          { label: "Log Out Anyway", role: "destructive", onSelect: () => void doLogout(true) },
          { label: "Cancel", role: "cancel" },
        ]}
      />
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

// MARK: - Profile image

/** ProfileImageRow: picks an image, lets the user crop it (ProfileImageCropView) and uploads it */
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

  return (
    <FormRow className="flex-col items-start gap-1">
      <div className="flex items-center gap-4">
        <ProfileIcon
          hash={user.profileIconUrl}
          size={64}
          color={user.schemeColor}
          imageHash={user.profileImageUrl}
          overlay={isUploading ? <Spinner className="text-white" /> : undefined}
        />
        <button
          type="button"
          disabled={isUploading}
          onClick={() => input.current?.click()}
          className="text-app active:opacity-50 disabled:opacity-40"
        >
          {user.profileImageUrl ? "Change Profile Image" : "Add Profile Image"}
        </button>
        {user.profileImageUrl && (
          <button
            type="button"
            disabled={isUploading}
            onClick={() => void remove()}
            className="text-[#ff3b30] active:opacity-50 disabled:opacity-40 dark:text-[#ff453a]"
          >
            Remove
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void picked(event.target.files?.[0])}
        />
      </div>
      {error && <p className="text-footnote text-[#ff3b30]">{error}</p>}
      {imageToCrop && <ProfileImageCrop image={imageToCrop} onCancel={closeCrop} onChoose={(jpeg) => void upload(jpeg)} />}
    </FormRow>
  );
}

"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingGroup } from "@/components/settings/settings-primitives";
import { updateProfile, changePassword } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";

const MAX_NAME = 64;
// The avatar is stored inline on the user row and ships with every
// /api/auth/me, so it is kept small. The server independently rejects anything
// over 128KB or 512px.
const AVATAR_PX = 512;
const AVATAR_MAX_BYTES = 128 * 1024;
// Stepped down until the encode fits the cap, so a detailed photo degrades in
// quality instead of being refused.
const AVATAR_QUALITIES = [0.8, 0.65, 0.5, 0.35];
// An avatar never needs a big source file, and decoding a huge one would hang
// the tab, so oversized picks are refused before any decoding happens.
const AVATAR_SOURCE_MAX_BYTES = 1024 * 1024;

/** Center-crop and downscale to a square JPEG data URI in the browser, so the
 *  original photo never reaches the server and the stored value stays small.
 *  Returns null when even the lowest quality will not fit. */
async function toAvatarDataURI(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("canvas unavailable");
  }
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_PX,
    AVATAR_PX,
  );
  bitmap.close();
  for (const q of AVATAR_QUALITIES) {
    const uri = canvas.toDataURL("image/jpeg", q);
    if (uri.length <= AVATAR_MAX_BYTES) return uri;
  }
  return null;
}

export function ProfileSettings() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [avatar, setAvatar] = useState(user?.avatar_url ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const initial = (user?.display_name || user?.username || "?").charAt(0).toUpperCase();
  const profileDirty =
    displayName !== (user?.display_name ?? "") || avatar !== (user?.avatar_url ?? "");

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file");
      return;
    }
    if (file.size > AVATAR_SOURCE_MAX_BYTES) {
      toast.error("That image is too large — pick one under 1 MB");
      return;
    }
    try {
      const uri = await toAvatarDataURI(file);
      if (!uri) {
        toast.error("Could not compress that image small enough — try a simpler one");
        return;
      }
      setAvatar(uri);
    } catch {
      toast.error("Could not read that image");
    }
  };

  const saveProfile = async () => {
    if (!accessToken) return;
    setSavingProfile(true);
    try {
      const updated = await updateProfile(accessToken, {
        display_name: displayName.trim(),
        avatar_url: avatar,
      });
      setUser(updated);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (force = false) => {
    if (!accessToken) return;
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await changePassword(accessToken, currentPassword, newPassword, force);
      // A breach hit comes back as a 200 with a warning rather than an error,
      // so the user can knowingly accept it.
      if (res.requires === "force" && res.warning) {
        if (window.confirm(`${res.warning}\n\nUse it anyway?`)) {
          setSavingPassword(false);
          await savePassword(true);
          return;
        }
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed — other sessions have been signed out");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-3">
      <SettingGroup
        label="Profile"
        footnote="Your username and email identify your account and can't be changed here — the username is how others resolve your public key when sharing."
      >
        <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center gap-4">
            {avatar ? (
              // A local data: URI capped at 128KB — there is nothing for
              // next/image to optimize, and its loader cannot fetch data URIs.
              // oxlint-disable-next-line no-img-element
              <img src={avatar} alt="Your avatar" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-accent)] text-xl font-semibold text-white">
                {initial}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void pickAvatar(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                Change photo
              </Button>
              {avatar && (
                <Button variant="ghost" onClick={() => setAvatar("")}>
                  Remove
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="display-name"
              className="text-xs font-medium text-[var(--color-text-muted)]"
            >
              Display name
            </label>
            <Input
              id="display-name"
              value={displayName}
              maxLength={MAX_NAME}
              placeholder={user?.username ?? "Your name"}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Username</span>
              <p className="truncate text-sm text-[var(--color-text)]">{user?.username}</p>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Email</span>
              <p className="truncate text-sm text-[var(--color-text)]">{user?.email}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void saveProfile()} disabled={!profileDirty || savingProfile}>
              {savingProfile ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </div>
      </SettingGroup>

      <SettingGroup
        label="Password"
        footnote="Changing your password signs out every other device. Your vault passphrase is separate and is never sent to the server."
      >
        <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="space-y-1.5">
            <label
              htmlFor="current-password"
              className="text-xs font-medium text-[var(--color-text-muted)]"
            >
              Current password
            </label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="new-password"
                className="text-xs font-medium text-[var(--color-text-muted)]"
              >
                New password
              </label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="confirm-password"
                className="text-xs font-medium text-[var(--color-text-muted)]"
              >
                Confirm new password
              </label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            At least 8 characters, with an uppercase letter, a digit and a special character.
          </p>
          <div className="flex justify-end">
            <Button
              onClick={() => void savePassword()}
              disabled={!currentPassword || !newPassword || !confirmPassword || savingPassword}
            >
              {savingPassword ? "Changing…" : "Change password"}
            </Button>
          </div>
        </div>
      </SettingGroup>
    </div>
  );
}

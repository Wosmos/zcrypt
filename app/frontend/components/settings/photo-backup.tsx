"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingGroup, ValueRow } from "@/components/settings/settings-primitives";
import { useVaultLockContext } from "@/components/providers/vault-lock-provider";
import { ensureUserKeypair } from "@/lib/keys";
import { toBase64 } from "@/lib/crypto";
import {
  photoBackupDisable,
  photoBackupEnable,
  photoBackupOptions,
  photoBackupSetOptions,
  type PhotoOptions,
} from "@/lib/tauri";
import {
  listPhotoAlbums,
  openAppSettings,
  photoAlbumThumbnail,
  readPhotoBackup,
  requestPhotoAccess,
  runPhotoBackupNow,
  savePhotoBackup,
  type PhotoAlbum,
  type PhotoBackupSettings,
  type PhotoBackupState,
} from "@/lib/android-photo-backup";
import { Image as ImageIcon, RefreshCw, Shield, Wifi, Zap } from "@/lib/icons";
import { useKeysStore } from "@/store/keys";
import { toast } from "@/store/toast";

const FIELD =
  "h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10";

const ICON =
  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]";

function errorText(err: unknown, fallback: string): string {
  if (typeof err === "string" && err) return err;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function settingsOf(s: PhotoBackupState): PhotoBackupSettings {
  return { enabled: s.enabled, wifiOnly: s.wifiOnly, chargingOnly: s.chargingOnly };
}

/** A setting with its choices under the text, so nothing is cut off on a phone. */
function ChoiceRow({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <span className={ICON}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{subtitle}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  );
}

/** An album's cover, fetched small from the phone once the row is on screen. */
function Cover({ album }: { album: PhotoAlbum }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let gone = false;
    void Promise.resolve().then(() => {
      if (!gone) setSrc(photoAlbumThumbnail(album.coverUri));
    });
    return () => {
      gone = true;
    };
  }, [album.coverUri]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a base64 thumbnail from the phone
    <img src={src} alt="" className="h-9 w-9 rounded-xl object-cover" />
  ) : (
    <ImageIcon className="h-4 w-4" />
  );
}

/** Android: back up chosen albums of the phone's photos and videos in the background. */
export function PhotoBackup() {
  const t = useTranslations("settings.photoBackup");
  const vault = useVaultLockContext();
  const [state, setState] = useState<PhotoBackupState | null>(null);
  const [options, setOptions] = useState<PhotoOptions | null>(null);
  const [files, setFiles] = useState<number | null>(null);
  const [albums, setAlbums] = useState<PhotoAlbum[] | null>(null);
  const [busy, setBusy] = useState(false);
  const enabled = state?.enabled === true;
  const access = state?.access;

  useEffect(() => {
    let gone = false;
    const refresh = () => {
      if (document.visibilityState === "visible") setState(readPhotoBackup());
    };
    document.addEventListener("visibilitychange", refresh);
    void Promise.resolve().then(() => {
      if (!gone) setState(readPhotoBackup());
    });
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const loadAlbums = useCallback(() => setAlbums(listPhotoAlbums()), []);

  useEffect(() => {
    if (!enabled) return;
    let gone = false;
    photoBackupOptions().then(
      (status) => {
        if (gone) return;
        setOptions(status);
        setFiles(status.files);
      },
      () => {},
    );
    if (access !== "none") void Promise.resolve().then(() => !gone && loadAlbums());
    return () => {
      gone = true;
    };
  }, [enabled, access, loadAlbums]);

  if (!state) return null;

  const persist = async (next: PhotoOptions, on = state.enabled) => {
    try {
      await photoBackupSetOptions(next);
      setOptions(next);
      savePhotoBackup({
        ...settingsOf(state),
        enabled: on,
        wifiOnly: next.wifi_only,
        chargingOnly: next.charging_only,
      });
      setState((s) =>
        s ? { ...s, enabled: on, wifiOnly: next.wifi_only, chargingOnly: next.charging_only } : s,
      );
      return true;
    } catch {
      toast.error(t("saveFailed"));
      return false;
    }
  };

  const seal = async (passphrase: string) => {
    setBusy(true);
    try {
      await ensureUserKeypair(passphrase);
      const key = useKeysStore.getState().publicKey;
      if (!key) throw new Error(t("keyUnavailable"));
      const status = await photoBackupEnable(toBase64(key));
      setFiles(status.files);
      const found = listPhotoAlbums();
      setAlbums(found);
      const cameras = found.filter((a) => a.camera).map((a) => a.bucketId);
      await persist(
        { ...status, albums: status.albums ?? (cameras.length ? cameras : null) },
        true,
      );
      toast.success(t("turnedOn"));
    } catch (err) {
      toast.error(errorText(err, t("turnOnFailed")));
    } finally {
      setBusy(false);
    }
  };

  const turnOn = async () => {
    const granted = state.access === "none" ? await requestPhotoAccess() : state.access;
    setState((s) => (s ? { ...s, access: granted } : s));
    if (granted === "none") {
      toast.error(t("needsAccess"));
      return;
    }
    vault.withPassphrase((pp) => void seal(pp));
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await photoBackupDisable();
      savePhotoBackup({ ...settingsOf(state), enabled: false });
      setState({ ...state, enabled: false });
      toast.success(t("turnedOff"));
    } catch (err) {
      toast.error(errorText(err, t("turnOffFailed")));
    } finally {
      setBusy(false);
    }
  };

  const allowAll = async () => {
    const granted = await requestPhotoAccess();
    setState((s) => (s ? { ...s, access: granted } : s));
    if (granted === "all") loadAlbums();
    else openAppSettings();
  };

  const chosen = options?.albums ?? (albums ?? []).filter((a) => a.camera).map((a) => a.bucketId);
  const toggleAlbum = (id: string, on: boolean) => {
    if (!options) return;
    const next = on ? [...new Set([...chosen, id])] : chosen.filter((x) => x !== id);
    void persist({ ...options, albums: next });
  };

  return (
    <>
      <SettingGroup label={t("label")} footnote={t("footnote")}>
        <ValueRow
          icon={<ImageIcon className="h-4 w-4" />}
          title={t("title")}
          subtitle={
            state.enabled ? (files === null ? t("on") : t("status", { count: files })) : t("off")
          }
          trailing={
            <Switch
              aria-label={t("title")}
              checked={state.enabled}
              disabled={busy}
              onCheckedChange={(on) => void (on ? turnOn() : turnOff())}
            />
          }
        />
        {state.enabled && state.access !== "all" && (
          <ValueRow
            icon={<Shield className="h-4 w-4" />}
            title={state.access === "partial" ? t("partialTitle") : t("noAccessTitle")}
            subtitle={state.access === "partial" ? t("partialDesc") : t("noAccessDesc")}
            trailing={
              <Button variant="secondary" size="sm" onClick={() => void allowAll()}>
                {t("allowAll")}
              </Button>
            }
          />
        )}
      </SettingGroup>
      {state.enabled && (
        <>
          <SettingGroup label={t("albumsLabel")}>
            {albums && albums.length === 0 && (
              <p className="px-4 py-3 text-sm text-[var(--color-text-muted)]">{t("albumsEmpty")}</p>
            )}
            {(albums ?? []).map((album) => (
              <ValueRow
                key={album.bucketId}
                icon={<Cover album={album} />}
                title={album.name}
                subtitle={t("albumCount", { count: album.count })}
                trailing={
                  <Switch
                    aria-label={album.name}
                    checked={chosen.includes(album.bucketId)}
                    disabled={!options}
                    onCheckedChange={(on) => toggleAlbum(album.bucketId, on)}
                  />
                }
              />
            ))}
          </SettingGroup>
          <SettingGroup>
            <ChoiceRow
              icon={<ImageIcon className="h-4 w-4" />}
              title={t("kindsTitle")}
              subtitle={t("kindsDesc")}
            >
              <select
                aria-label={t("kindsTitle")}
                value={options?.kinds ?? "both"}
                disabled={!options}
                onChange={(e) =>
                  options &&
                  void persist({ ...options, kinds: e.target.value as PhotoOptions["kinds"] })
                }
                className={FIELD}
              >
                <option value="photos">{t("kindsPhotos")}</option>
                <option value="videos">{t("kindsVideos")}</option>
                <option value="both">{t("kindsBoth")}</option>
              </select>
            </ChoiceRow>
            <ValueRow
              icon={<Wifi className="h-4 w-4" />}
              title={t("wifiTitle")}
              subtitle={t("wifiDesc")}
              trailing={
                <Switch
                  aria-label={t("wifiTitle")}
                  checked={options?.wifi_only ?? state.wifiOnly}
                  disabled={!options}
                  onCheckedChange={(on) => options && void persist({ ...options, wifi_only: on })}
                />
              }
            />
            <ValueRow
              icon={<Zap className="h-4 w-4" />}
              title={t("chargingTitle")}
              subtitle={t("chargingDesc")}
              trailing={
                <Switch
                  aria-label={t("chargingTitle")}
                  checked={options?.charging_only ?? state.chargingOnly}
                  disabled={!options}
                  onCheckedChange={(on) =>
                    options && void persist({ ...options, charging_only: on })
                  }
                />
              }
            />
            <ValueRow
              icon={<RefreshCw className="h-4 w-4" />}
              title={t("runNowTitle")}
              subtitle={t("runNowDesc")}
              trailing={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    runPhotoBackupNow();
                    toast.success(t("runNowStarted"));
                  }}
                >
                  {t("runNow")}
                </Button>
              }
            />
          </SettingGroup>
        </>
      )}
    </>
  );
}

import { notify } from "@/lib/notify";
import { toast } from "@/store/toast";
import { tr } from "@/store/translate";

/** Someone signed in to this account from another device. */
export function announceNewSignIn(device: string): void {
  toast.warning(tr("notify.newSignIn"), {
    detail: tr("notify.newSignInBody", { device }),
    key: "announce:sign-in",
    sound: { event: "headsUp", area: "security" },
  });
  void notify({ type: "newSignIn", device });
}

/** Uploads stopped because the storage cap was reached. */
export function announceStorageFull(): void {
  toast.warning(tr("notify.storageFull"), {
    detail: tr("notify.storageFullBody"),
    key: "announce:storage",
    sound: { event: "headsUp", area: "transfers" },
  });
  void notify({ type: "storageFull" });
}

/** Someone invited this account to a Space. Not wired yet: the server sends no invite event. */
export function announceInviteReceived(space: string): void {
  toast.info(tr("notify.inviteReceived", { space }), {
    detail: tr("notify.inviteReceivedBody"),
    key: `announce:invite:${space}`,
    sound: { event: "headsUp", area: "sharing" },
  });
  void notify({ type: "inviteReceived", space });
}

/** Someone opened a share link. Not wired yet: the server sends no link-view event. */
export function announceLinkViewed(name: string): void {
  toast.info(tr("notify.linkViewed"), {
    detail: name,
    key: `announce:link:${name}`,
    sound: { event: "headsUp", area: "sharing" },
  });
  void notify({ type: "linkViewed", name });
}

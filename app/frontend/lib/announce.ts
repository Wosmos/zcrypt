import { notify } from "@/lib/notify";
import { isInBackground } from "@/lib/sounds";
import { toast } from "@/store/toast";
import { tr } from "@/store/translate";

/** Uploads stopped because the storage cap was reached. Toast in view, system notification out of view. */
export function announceStorageFull(): void {
  if (isInBackground()) {
    void notify({ type: "storageFull" });
    return;
  }
  toast.warning(tr("notify.storageFull"), {
    detail: tr("notify.storageFullBody"),
    key: "announce:storage",
    sound: { event: "headsUp", area: "transfers" },
  });
}

export type TourName = "vault" | "share" | "share-copy" | "spaces";

export interface TourStepDef {
  targets?: string[];
  title: string;
  content: string;
  side?: "top" | "bottom" | "left" | "right";
}

export interface ResolvedTourStep {
  title: string;
  content: string;
  selector?: string;
  side?: TourStepDef["side"];
  showControls: boolean;
  showSkip: boolean;
  blockKeyboardControl: boolean;
  pointerPadding: number;
  pointerRadius: number;
  selectorRetryAttempts: number;
  selectorRetryDelay: number;
}

export const TOUR_STEPS: Record<TourName, TourStepDef[]> = {
  vault: [
    {
      targets: ["vault-search"],
      title: "Find anything fast",
      content: "Type to filter your files and folders. Press / from anywhere to jump here.",
      side: "bottom",
    },
    {
      targets: ["upload-button", "upload-fab"],
      title: "Add your files",
      content:
        "Upload files here. They are encrypted on your device before they go anywhere. On a phone, use the plus button.",
      side: "bottom",
    },
    {
      targets: ["new-folder"],
      title: "Keep things tidy",
      content: "Make a new folder to organize your files. You can drag files into it later.",
      side: "bottom",
    },
    {
      targets: ["file-card"],
      title: "Every file has a menu",
      content: "Right-click a file, or long-press on a phone, to share, move, rename or delete it.",
      side: "right",
    },
    {
      targets: ["vault-lock", "vault-lock-mobile"],
      title: "Lock and unlock",
      content:
        "This is your vault lock. Unlock it with your passphrase to open files, and lock it again when you are done.",
      side: "bottom",
    },
    {
      targets: ["nav-spaces", "nav-spaces-mobile"],
      title: "Spaces",
      content: "Share a folder with people you invite, still end-to-end encrypted.",
      side: "right",
    },
    {
      targets: ["nav-insights", "nav-insights-mobile"],
      title: "Insights",
      content: "See how much storage you use and what your vault has been up to.",
      side: "right",
    },
  ],
  share: [
    {
      targets: ["share-password"],
      title: "Add a password",
      content: "Turn this on and anyone opening the link will need the password too.",
      side: "bottom",
    },
    {
      targets: ["share-expiry"],
      title: "Set an expiry",
      content: "Pick when the link stops working. After that, nobody can open it.",
      side: "top",
    },
    {
      targets: ["share-generate"],
      title: "Make the link",
      content: "When you are happy with the options, create your link.",
      side: "top",
    },
  ],
  "share-copy": [
    {
      targets: ["share-copy"],
      title: "Copy your link",
      content:
        "Copy it and send it to whoever you like. Keep the whole link, including the part after the #.",
      side: "top",
    },
  ],
  spaces: [
    {
      title: "Welcome to Spaces",
      content:
        "A space is a shared folder that only the people you invite can open. Everything stays end-to-end encrypted.",
    },
    {
      targets: ["space-new"],
      title: "Start a space",
      content:
        "Create one, name it, and invite people. You choose who can edit and who can only view.",
      side: "bottom",
    },
    {
      targets: ["space-list"],
      title: "Your spaces live here",
      content: "Open any space to add files, manage members or revoke access.",
      side: "top",
    },
  ],
};

const storageKey = (userId: string) => `zcrypt-tours:${userId}`;

function readSeen(userId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function hasSeenTour(userId: string, tour: TourName): boolean {
  return readSeen(userId).includes(tour);
}

export function markTourSeen(userId: string, tour: TourName): void {
  const seen = readSeen(userId);
  if (seen.includes(tour)) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...seen, tour]));
  } catch {
    /* storage unavailable */
  }
}

export function resetTours(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* storage unavailable */
  }
}

export const tourSelector = (id: string) => `[data-tour="${id}"]`;

function isVisible(el: Element): boolean {
  return el.getClientRects().length > 0;
}

function findVisibleTarget(targets: string[], root: ParentNode): string | null {
  for (const id of targets) {
    const selector = tourSelector(id);
    const el = root.querySelector(selector);
    if (el && isVisible(el)) return selector;
  }
  return null;
}

export function resolveTour(name: TourName, root: ParentNode = document): ResolvedTourStep[] {
  const out: ResolvedTourStep[] = [];
  for (const def of TOUR_STEPS[name]) {
    let selector: string | undefined;
    if (def.targets) {
      const found = findVisibleTarget(def.targets, root);
      if (!found) continue;
      selector = found;
    }
    out.push({
      title: def.title,
      content: def.content,
      selector,
      side: def.side,
      showControls: true,
      showSkip: true,
      blockKeyboardControl: true,
      pointerPadding: 8,
      pointerRadius: 14,
      selectorRetryAttempts: 4,
      selectorRetryDelay: 150,
    });
  }
  return out;
}

/**
 * Folder silhouette designs for the MacFolder glyph (see explorer-card /
 * explorer-row). Each shape is drawn in a `0 0 120 100` viewBox:
 *  - `pocket`    — the front face (also the clip-path for a custom background)
 *  - `backPanel` — the raised tab / fold / sheet layer behind the pocket
 *  - `details`   — optional white overlay paths (fold lines, paper sheets,
 *                  facets) that give each design its own character; drawn last
 *                  at the given opacity so they read on any color or gradient.
 *
 * The active shape follows the surface style (so a Neo-Brutalist app gets the
 * angular folder, Clay gets the blob — SHAPE_FOR_SURFACE) unless the user
 * explicitly picks one in settings. Keys are persisted per device; keep them
 * stable even when the artwork evolves.
 */
export interface FolderShape {
  key: string;
  label: string;
  /** Front pocket outline; also the clip-path for a custom background fill. */
  pocket: string;
  /** Raised tab / back layer behind the pocket. */
  backPanel: string;
  /** Decorative white overlays drawn on top of the pocket. */
  details?: { d: string; opacity: number }[];
}

export const FOLDER_SHAPES: FolderShape[] = [
  {
    // The original macOS-style two-tone folder — the default look.
    key: "mac",
    label: "Mac",
    pocket:
      "M10 40 a12 12 0 0 1 12 -12 H98 a12 12 0 0 1 12 12 V78 a12 12 0 0 1 -12 12 H22 a12 12 0 0 1 -12 -12 Z",
    backPanel:
      "M10 42 V30 a12 12 0 0 1 12 -12 H44 a6 6 0 0 1 4.24 1.76 L54 23.5 a6 6 0 0 0 4.24 1.76 H98 a12 12 0 0 1 12 12 V44 Z",
  },
  {
    // Super-rounded squeezable blob with a pill tab — Clay's native shape.
    key: "round",
    label: "Blob",
    pocket:
      "M10 52 a24 24 0 0 1 24 -24 H86 a24 24 0 0 1 24 24 V66 a24 24 0 0 1 -24 24 H34 a24 24 0 0 1 -24 -24 Z",
    backPanel: "M18 40 a14 14 0 0 1 14 -14 H52 a14 14 0 0 1 14 14 v4 H18 Z",
    details: [
      // Soft belly highlight along the bottom — the "inflated" read.
      { d: "M22 76 a20 20 0 0 0 12 8 H86 a20 20 0 0 0 12 -8 v6 a24 24 0 0 1 -12 8 H34 a24 24 0 0 1 -12 -8 Z", opacity: 0.14 },
    ],
  },
  {
    // Manila folder: right-side tab, a paper peeking out, tapered front.
    key: "classic",
    label: "Manila",
    pocket:
      "M8 40 H112 L104 84 a8 8 0 0 1 -7.9 6.8 H23.9 A8 8 0 0 1 16 84 Z",
    backPanel:
      "M62 18 H100 a6 6 0 0 1 6 6 V40 H56 V24 a6 6 0 0 1 6 -6 Z M14 26 a6 6 0 0 1 6 -6 H52 V40 H14 Z",
    details: [
      // The sheet of paper tucked inside.
      { d: "M22 24 H84 a3 3 0 0 1 3 3 V40 H19 V27 a3 3 0 0 1 3 -3 Z", opacity: 0.55 },
      { d: "M28 29 H68 v3 H28 Z", opacity: 0.3 },
      { d: "M28 34 H58 v3 H28 Z", opacity: 0.3 },
    ],
  },
  {
    // Angular, faceted, zero-radius — Neo-Brutalist's native shape.
    key: "square",
    label: "Angular",
    pocket: "M12 32 H108 V78 L94 92 H12 Z",
    backPanel: "M12 16 h42 l12 12 H12 Z",
    details: [
      // Cut-corner facet + a hard top stripe.
      { d: "M94 92 L108 78 V92 Z", opacity: 0.35 },
      { d: "M12 32 H108 v5 H12 Z", opacity: 0.22 },
    ],
  },
  {
    // A document with a folded dog-ear and text lines.
    key: "paper",
    label: "Paper",
    pocket:
      "M26 14 H84 L102 32 V84 a6 6 0 0 1 -6 6 H26 a6 6 0 0 1 -6 -6 V20 a6 6 0 0 1 6 -6 Z",
    backPanel: "M84 14 L102 32 H90 a6 6 0 0 1 -6 -6 Z",
    details: [
      { d: "M34 46 h44 v5 H34 Z", opacity: 0.5 },
      { d: "M34 58 h36 v5 H34 Z", opacity: 0.35 },
      { d: "M34 70 h24 v5 H34 Z", opacity: 0.25 },
    ],
  },
  {
    // An open tray with a sheet sticking out of it.
    key: "tray",
    label: "Tray",
    pocket: "M10 46 H110 V80 a10 10 0 0 1 -10 10 H20 A10 10 0 0 1 10 80 Z",
    backPanel: "M28 14 H92 a4 4 0 0 1 4 4 V48 H24 V18 a4 4 0 0 1 4 -4 Z",
    details: [
      // Tray lip.
      { d: "M10 46 H110 v6 H10 Z", opacity: 0.25 },
    ],
  },
];

const SHAPE_BY_KEY = new Map(FOLDER_SHAPES.map((s) => [s.key, s]));

/** Resolve a shape key to its paths, falling back to the first (Mac) shape. */
export function getFolderShape(key: string | undefined | null): FolderShape {
  return (key ? SHAPE_BY_KEY.get(key) : undefined) ?? FOLDER_SHAPES[0];
}

/** Default folder shape per surface style, so the folder speaks the same design
 *  language as the rest of the UI when the user hasn't picked one explicitly. */
export const SHAPE_FOR_SURFACE: Record<string, string> = {
  default: "mac",
  brutalist: "square",
  claymorphism: "round",
  neumorphism: "round",
};

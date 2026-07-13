/**
 * Folder silhouette designs for the MacFolder glyph (see explorer-card /
 * explorer-row). Each shape is a pair of SVG paths in a `0 0 120 100` viewBox:
 * `pocket` is the front face (also used as the clip-path for a custom
 * background) and `backPanel` is the raised tab / fold behind it.
 *
 * The active shape follows the surface style (so a Brutalist app gets square
 * folders, a Claymorphism app gets round ones — SHAPE_FOR_SURFACE), unless the
 * user explicitly picks one in settings.
 */
export interface FolderShape {
  key: string;
  label: string;
  /** Front pocket outline; also the clip-path for a custom background fill. */
  pocket: string;
  /** Raised tab / back layer behind the pocket. */
  backPanel: string;
}

export const FOLDER_SHAPES: FolderShape[] = [
  {
    key: "mac",
    label: "Mac",
    pocket:
      "M10 40 a12 12 0 0 1 12 -12 H98 a12 12 0 0 1 12 12 V78 a12 12 0 0 1 -12 12 H22 a12 12 0 0 1 -12 -12 Z",
    backPanel:
      "M10 42 V30 a12 12 0 0 1 12 -12 H44 a6 6 0 0 1 4.24 1.76 L54 23.5 a6 6 0 0 0 4.24 1.76 H98 a12 12 0 0 1 12 12 V44 Z",
  },
  {
    key: "round",
    label: "Round",
    pocket:
      "M10 50 a22 22 0 0 1 22 -22 H88 a22 22 0 0 1 22 22 V68 a22 22 0 0 1 -22 22 H32 a22 22 0 0 1 -22 -22 Z",
    backPanel:
      "M10 50 V36 a18 18 0 0 1 18 -18 H46 a6 6 0 0 1 4.24 1.76 L54 23.5 a6 6 0 0 0 4.24 1.76 H92 a18 18 0 0 1 18 18 V52 Z",
  },
  {
    key: "classic",
    label: "Classic",
    pocket: "M10 34 a4 4 0 0 1 4 -4 H106 a4 4 0 0 1 4 4 V86 a4 4 0 0 1 -4 4 H14 a4 4 0 0 1 -4 -4 Z",
    backPanel: "M10 36 V24 a4 4 0 0 1 4 -4 H45 l6 6 H106 a4 4 0 0 1 4 4 V40 Z",
  },
  {
    key: "square",
    label: "Square",
    pocket: "M10 30 H110 V90 H10 Z",
    backPanel: "M10 30 V19 H45 L51 25 H110 V32 Z",
  },
  {
    key: "paper",
    label: "Paper",
    // A document/paper card with a folded top-right corner (dog-ear).
    pocket: "M24 18 H88 L104 34 V84 a4 4 0 0 1 -4 4 H24 a4 4 0 0 1 -4 -4 V22 a4 4 0 0 1 4 -4 Z",
    backPanel: "M88 18 L104 34 H92 a4 4 0 0 1 -4 -4 Z",
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

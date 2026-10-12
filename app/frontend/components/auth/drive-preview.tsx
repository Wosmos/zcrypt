import { useTranslations } from "next-intl";
import { DocTile, FolderTile, ThumbTile } from "@/components/files/tiles/tiles";
import { PreviewArt } from "@/components/marketing/landing/drive/preview-art";
import type { ArtKey } from "@/components/marketing/landing/drive/drive-data";
import { Lock } from "@/lib/icons";
import { fileIconFor, getFileTypeInfo } from "@/lib/utils";

type Item =
  | { kind: "folder"; name: string; tint?: string }
  | { kind: "photo"; name: string; art: ArtKey }
  | { kind: "doc"; name: string };

const ITEMS: Item[] = [
  { kind: "folder", name: "Work" },
  { kind: "folder", name: "Family", tint: "#f59e0b" },
  { kind: "photo", name: "beach.jpg", art: "beach" },
  { kind: "doc", name: "tax-return.pdf" },
  { kind: "photo", name: "milo.jpg", art: "cat" },
  { kind: "doc", name: "budget.xlsx" },
  { kind: "photo", name: "sunset.jpg", art: "sunset" },
  { kind: "doc", name: "notes.md" },
];

function Tile({ item }: { item: Item }) {
  if (item.kind === "folder") {
    return <FolderTile className="w-[64px]" initial={item.name[0]} color={item.tint} />;
  }
  if (item.kind === "photo") {
    return (
      <ThumbTile className="h-[46px] w-[62px]">
        <PreviewArt art={item.art} />
      </ThumbTile>
    );
  }
  return (
    <DocTile
      Icon={fileIconFor(item.name)}
      ext={item.name.split(".").pop()?.toUpperCase()}
      colorClass={getFileTypeInfo(item.name).color}
      className="origin-bottom scale-[0.6]"
    />
  );
}

/** A still, miniature vault window: the drive you are signing in to. */
export function DrivePreview() {
  const t = useTranslations("auth.panel");
  return (
    <figure
      aria-hidden
      dir="ltr"
      className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1118]/80 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-md"
    >
      <div className="flex items-center gap-1.5 border-b border-white/[0.07] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ms-3 text-xs font-medium text-white/60">My Vault</span>
      </div>
      <ul className="grid grid-cols-4 gap-x-3 gap-y-4 px-5 pb-4 pt-5">
        {ITEMS.map((item) => (
          <li key={item.name} className="flex flex-col items-center gap-2">
            <div className="flex h-[56px] w-full items-end justify-center overflow-hidden">
              <Tile item={item} />
            </div>
            <span className="max-w-full truncate text-[11px] text-white/70">{item.name}</span>
          </li>
        ))}
      </ul>
      <figcaption className="flex items-center gap-2 border-t border-white/[0.07] px-4 py-2.5 text-[11px] text-white/55">
        <Lock className="h-3 w-3 text-cyan-300" aria-hidden />
        {t("encrypted")}
      </figcaption>
    </figure>
  );
}

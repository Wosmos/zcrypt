import { cn } from "@/lib/utils";

/** The flat, hatched tile the platforms actually store. */
export function BinTile({ name, more }: { name: string; more?: string }) {
  return (
    <span className={cn("zh-bin", more && "zh-bin-more")} aria-hidden="true">
      {more ? (
        <span>{more}</span>
      ) : (
        <>
          <span className="zh-bin-dir">{name.slice(0, 2)}</span>
          <span className="zh-bin-x">.bin</span>
        </>
      )}
    </span>
  );
}

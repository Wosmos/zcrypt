import { createElement } from "react";
import { fileIconFor } from "@/lib/utils";

export function FileTypeIcon({
  name,
  className,
  strokeWidth,
}: {
  name: string;
  className?: string;
  strokeWidth?: number;
}) {
  return createElement(fileIconFor(name), { className, strokeWidth });
}

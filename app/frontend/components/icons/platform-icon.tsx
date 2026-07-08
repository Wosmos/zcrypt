import { Github } from "@/lib/icons";
import { GitlabIcon } from "./gitlab";
import { HuggingFaceIcon } from "./huggingface";
import { TelegramIcon } from "./telegram";
import { PLATFORM_BY_ID, type PlatformId } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type IconComponent = (props: { className?: string }) => React.ReactNode;

const ICONS: Record<PlatformId, IconComponent> = {
  github: Github,
  gitlab: GitlabIcon,
  huggingface: HuggingFaceIcon,
  telegram: TelegramIcon,
};

/**
 * Brand glyph for a storage platform id. Applies the platform's canonical brand
 * color (from lib/platforms) merged with any passed className (typically sizing).
 */
export function PlatformIcon({
  platform,
  className,
}: {
  platform: string;
  className?: string;
}) {
  const Icon = ICONS[platform as PlatformId];
  if (!Icon) return null;
  const meta = PLATFORM_BY_ID[platform as PlatformId];
  return <Icon className={cn(meta?.iconClass, className)} />;
}

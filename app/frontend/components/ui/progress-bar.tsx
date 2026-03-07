import { cn } from "@/lib/utils";

interface ProgressBarProps {
  percent: number;
  stage?: string;
  variant?: "default" | "accent" | "success";
  className?: string;
}

const barColors = {
  default: "bg-zinc-400",
  accent: "bg-indigo-500",
  success: "bg-emerald-500",
};

export function ProgressBar({
  percent,
  stage,
  variant = "accent",
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className={cn("w-full", className)}>
      {stage && (
        <div className="flex justify-between text-[11px] text-zinc-500 mb-1.5">
          <span className="capitalize font-medium">{stage}</span>
          <span className="tabular-nums">{clamped}%</span>
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-zinc-800/80 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            barColors[variant]
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

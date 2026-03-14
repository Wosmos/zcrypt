import { LogoIcon, Logo } from "@/components/ui/logo";

export default function RootLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-dvh animate-fade-in">
      {/* 3D logo icon */}
      <LogoIcon size={64} />

      {/* Spinner */}
      <div className="mt-6 h-5 w-5 rounded-full border-2 border-[var(--color-border)] border-t-cyan-500 animate-spin" />

      {/* Wordmark at bottom */}
      <div className="absolute bottom-8">
        <Logo size="sm" iconOnly={false} />
      </div>
    </div>
  );
}

import { Logo } from "@/components/ui/logo";
import { LogoSpinner } from "@/components/ui/logo-spinner";

export default function RootLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-dvh animate-fade-in">
      <LogoSpinner size="xl" speed="slow" />

      {/* Wordmark at bottom */}
      <div className="absolute bottom-8">
        <Logo size="sm" iconOnly={false} />
      </div>
    </div>
  );
}

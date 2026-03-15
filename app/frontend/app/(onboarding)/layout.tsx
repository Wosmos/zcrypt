import { Logo } from "@/components/ui/logo";
import { CircuitBackground } from "@/components/ui/circuit-background";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard skipOnboardingCheck>
      <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
        <CircuitBackground />
        <div className="mb-8">
          <Logo size="lg" href="/" />
        </div>
        <div className="w-full max-w-lg">
          {children}
        </div>
      </div>
    </AuthGuard>
  );
}

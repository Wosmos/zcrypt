import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";

/** Type of any icon component exported from `@/lib/icons`. */
type SubmitIcon = (typeof import("@/lib/icons"))["File"];

interface SubmitButtonProps {
  loading: boolean;
  disabled: boolean;
  loadingLabel: ReactNode;
  children: ReactNode;
  icon?: SubmitIcon;
  iconPosition?: "before" | "after";
  type?: "submit" | "button";
  onClick?: () => void;
}

/**
 * Full-width auth submit button. While `loading`, swaps content for a spinner +
 * `loadingLabel`; otherwise renders `children` with an optional icon before or
 * after (defaults to after). Omit `type` and pass `onClick` for the 2FA flow.
 */
export function SubmitButton({
  loading,
  disabled,
  loadingLabel,
  children,
  icon: Icon,
  iconPosition = "after",
  type,
  onClick,
}: SubmitButtonProps) {
  return (
    <Button
      type={type}
      onClick={onClick}
      className="w-full"
      size="lg"
      disabled={disabled}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <LogoSpinner size={16} speed="fast" />
          {loadingLabel}
        </span>
      ) : Icon ? (
        iconPosition === "before" ? (
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {children}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            {children} <Icon className="h-4 w-4" />
          </span>
        )
      ) : (
        children
      )}
    </Button>
  );
}

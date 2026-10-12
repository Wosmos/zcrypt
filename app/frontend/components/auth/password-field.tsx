"use client";

import { Input } from "@/components/ui/input";
import { Lock } from "@/lib/icons";

export function PasswordField({
  label,
  name,
  placeholder,
  autoComplete,
  value,
  onChange,
}: {
  label: string;
  name: string;
  placeholder: string;
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      label={label}
      type="password"
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      icon={<Lock className="h-4 w-4" />}
      required
      autoComplete={autoComplete}
    />
  );
}

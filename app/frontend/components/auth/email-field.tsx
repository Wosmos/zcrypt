"use client";

import { Input } from "@/components/ui/input";
import { Mail } from "@/lib/icons";

/** The email input shared by login, register, and other auth forms. */
export function EmailField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      label="Email"
      type="email"
      name="email"
      placeholder="you@example.com"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      icon={<Mail className="h-4 w-4" />}
      required
      autoComplete="email"
    />
  );
}

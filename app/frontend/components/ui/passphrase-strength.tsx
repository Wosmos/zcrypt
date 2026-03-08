"use client";

interface PassphraseStrengthProps {
  passphrase: string;
}

function evaluateStrength(passphrase: string): { score: number; label: string; color: string } {
  if (!passphrase) return { score: 0, label: "", color: "" };

  const len = passphrase.length;

  // Simple length-based scoring — no nagging about special chars
  if (len < 4) return { score: 1, label: "Short", color: "#f97316" };
  if (len < 8) return { score: 2, label: "Okay", color: "#eab308" };
  if (len < 14) return { score: 3, label: "Good", color: "#22c55e" };
  return { score: 4, label: "Strong", color: "#10b981" };
}

export function PassphraseStrength({ passphrase }: PassphraseStrengthProps) {
  const { score, label, color } = evaluateStrength(passphrase);

  if (!passphrase) return null;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i < score ? color : "var(--color-surface-2)",
            }}
          />
        ))}
      </div>
      <span className="text-[11px] font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

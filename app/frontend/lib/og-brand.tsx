import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE_DOMAIN } from "@/lib/site";

const MARK_DATA_URI = `data:image/svg+xml;base64,${readFileSync(
  join(process.cwd(), "public/brand/zcrypt-mark-dark-bg.svg"),
).toString("base64")}`;

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "zcrypt. Private Encrypted Cloud Storage";

// The opengraph and twitter cards are identical except for spacing polish that
// exists only on the opengraph variant (gap:0 on the brand row + letterSpacing
// on the wordmark and tagline). `variant` reproduces each route's exact styling
// so both rendered PNGs stay byte-identical to their originals.
export function renderBrandOgCard(opts: { variant?: "opengraph" | "twitter" } = {}) {
  const { variant = "opengraph" } = opts;
  const spaced = variant === "opengraph";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #09090b 0%, #0c1220 50%, #09090b 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle grid pattern */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage:
            "linear-gradient(rgba(0,213,228,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,213,228,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          display: "flex",
        }}
      />

      {/* Glow behind logo */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,213,228,0.12) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -55%)",
          display: "flex",
        }}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK_DATA_URI} width={132} height={132} alt="" style={{ marginBottom: 28 }} />

      {/* Brand name */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          ...(spaced ? { gap: 0 } : {}),
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#00d5e4",
            ...(spaced ? { letterSpacing: "-0.02em" } : {}),
          }}
        >
          z
        </span>
        <span
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#e4e4e7",
            ...(spaced ? { letterSpacing: "-0.02em" } : {}),
          }}
        >
          crypt
        </span>
        <span
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: "#71717a",
            marginLeft: 6,
          }}
        >
          .cloud
        </span>
      </div>

      {/* Tagline */}
      <p
        style={{
          fontSize: 26,
          color: "#a1a1aa",
          margin: 0,
          ...(spaced ? { letterSpacing: "0.01em" } : {}),
        }}
      >
        Private cloud storage that costs less
      </p>

      {/* Feature pills */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 32,
        }}
      >
        {["Zero-Knowledge Encryption", "AES-256-GCM", "Open Source", "10 GB Free"].map((label) => (
          <div
            key={label}
            style={{
              display: "flex",
              padding: "8px 20px",
              borderRadius: 999,
              border: "1px solid rgba(0,213,228,0.2)",
              background: "rgba(0,213,228,0.06)",
              fontSize: 16,
              color: "#00d5e4",
              fontWeight: 500,
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Bottom URL */}
      <p
        style={{
          position: "absolute",
          bottom: 28,
          fontSize: 18,
          color: "#52525b",
          margin: 0,
        }}
      >
        {SITE_DOMAIN}
      </p>
    </div>,
    {
      ...OG_SIZE,
    },
  );
}

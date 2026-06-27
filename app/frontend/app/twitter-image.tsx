import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export const alt = "zcrypt — Private Encrypted Cloud Storage";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
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

        {/* Logo icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            width: 120,
            height: 120,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 72,
              height: 72,
              borderRadius: 16,
              background: "linear-gradient(145deg, #008a97, #006d77)",
              top: 6,
              left: 0,
              transform: "rotate(-6deg)",
              boxShadow: "-3px 4px 16px rgba(0,0,0,0.6)",
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 72,
              height: 72,
              borderRadius: 16,
              background: "linear-gradient(145deg, #00e8f8, #00c5d4)",
              top: 26,
              left: 40,
              transform: "rotate(-2deg)",
              boxShadow: "-6px 6px 24px rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: "#09090b",
                lineHeight: 1,
              }}
            >
              z
            </span>
          </div>
        </div>

        {/* Brand name */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 64, fontWeight: 700, color: "#00d5e4" }}>z</span>
          <span style={{ fontSize: 64, fontWeight: 700, color: "#e4e4e7" }}>crypt</span>
          <span style={{ fontSize: 28, fontWeight: 600, color: "#71717a", marginLeft: 6 }}>.cloud</span>
        </div>

        {/* Tagline */}
        <p style={{ fontSize: 26, color: "#a1a1aa", margin: 0 }}>
          Private cloud storage that costs less
        </p>

        {/* Feature pills */}
        <div style={{ display: "flex", gap: 16, marginTop: 32 }}>
          {["Zero-Knowledge Encryption", "AES-256-GCM", "Open Source", "10 GB Free"].map(
            (label) => (
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
            ),
          )}
        </div>

        <p style={{ position: "absolute", bottom: 28, fontSize: 18, color: "#52525b", margin: 0 }}>
          zcrypt.cloud
        </p>
      </div>
    ),
    { ...size },
  );
}

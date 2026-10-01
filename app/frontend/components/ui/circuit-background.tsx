import { CIRCUITS } from "@/components/ui/circuit-paths";
import { CircuitPulses } from "@/components/ui/circuit-pulses";

export function CircuitBackground() {
  // Colors come from --circuit-* vars (light/dark in globals.css) so a theme
  // flip never re-renders this SVG: the View Transition in the theme provider
  // covers the color change, hence no transition-colors on the wrapper either.
  return (
    <div className="fixed inset-0 -z-50 overflow-hidden pointer-events-none bg-[var(--color-bg)] [contain:strict]">
      <svg
        className="absolute inset-0 w-full h-full opacity-50 dark:opacity-60"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Faint background static traces */}
        <g
          stroke="var(--circuit-trace)"
          fill="none"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          {CIRCUITS.map((circuit, i) => (
            <g key={`static-${i}`}>
              <path d={circuit.path} />
              {circuit.ends.map((end, j) => (
                <circle
                  key={`node-${i}-${j}`}
                  cx={end[0]}
                  cy={end[1]}
                  r="3"
                  fill="var(--circuit-trace)"
                  stroke="none"
                />
              ))}
            </g>
          ))}
        </g>
      </svg>

      <CircuitPulses />

      {/* Grid overlay for texture */}
      <div
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Vignette effect - increased fade to keep the center clean */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, var(--circuit-vignette-edge) 90%)",
        }}
      />
    </div>
  );
}

import { HowScene } from "./how-scene";
import { STEPS } from "./how-data";

export type StepIndex = 0 | 1 | 2;

function stateOf(i: number, active: StepIndex | "all") {
  if (active === "all" || i === active) return "active";
  return i < active ? "done" : "todo";
}

/** The numbered steps with the progress rail. `clips` adds a per-step scene for the stacked layout. */
export function HowTimeline({
  active = "all",
  clips = true,
}: {
  active?: StepIndex | "all";
  clips?: boolean;
}) {
  return (
    <div className="zw-tl">
      <span className="zw-rail" aria-hidden="true">
        <span className="zw-fill" />
      </span>
      <span className="zw-dot" aria-hidden="true" />
      <ol className="zw-steps">
        {STEPS.map((s, i) => (
          <li
            key={s.n}
            className="zw-step"
            data-state={stateOf(i, active)}
            aria-current={active === i ? "step" : undefined}
          >
            <span className="zw-node corner-squircle" aria-hidden="true">
              {s.n}
            </span>
            <div className="zw-copy">
              <h3 className="zw-h3">{s.title}</h3>
              <p className="zw-p">{s.body}</p>
              {clips ? (
                <div className="zw-clip">
                  <HowScene part={s.part} />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

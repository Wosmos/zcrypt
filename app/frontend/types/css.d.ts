import "react";

// `corner-shape` is a real CSS property (CSS Backgrounds & Borders L4) but is
// not yet in React's CSSProperties types. Augment it so inline styles type-check.
// MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/corner-shape
declare module "react" {
  interface CSSProperties {
    cornerShape?: string;
  }
}

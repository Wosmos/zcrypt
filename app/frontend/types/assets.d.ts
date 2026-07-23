// Ambient module declarations for bundler-handled asset imports. Turbopack (and
// the Vercel/webpack build) resolve `import "./globals.css"` at build time —
// TypeScript never sees a real module there.
//
// Classic `tsc` tolerates the global-CSS side-effect import via Next's injected
// types, but the native TS7 compiler (`tsgo`) does not and errors TS2882. This
// file must stay a pure ambient script (no top-level import/export), otherwise
// the wildcard `declare module` is scoped as an augmentation instead of a global
// ambient declaration and tsgo still fails.
declare module "*.css";

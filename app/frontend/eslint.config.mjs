import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    extends: [...tseslint.configs.recommended],
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // Only the two classic hook rules — v7's "recommended" preset also
      // bundles ~20 React Compiler-readiness rules (set-state-in-effect,
      // immutability, purity, ...) this codebase has never been checked
      // against; enabling those wholesale surfaced 84 new errors unrelated
      // to what core-web-vitals actually needs.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: [".next/", "node_modules/", "out/"],
  },
);

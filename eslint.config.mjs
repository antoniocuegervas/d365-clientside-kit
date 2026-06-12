// @ts-check
import tseslint from "typescript-eslint";

/**
 * Single flat config for the main kit (shared/, clientui/, clienthooks/, tests/).
 * PCF projects under pcfs/ are excluded, they carry their own pcf-scripts lint setup.
 */
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "storybook-static/**",
      "pcfs/**",
      "deployment/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Class-component MVVM kit: empty-ish lifecycle stubs and `any` escapes
      // are decided case by case, but unused vars are always a smell.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // section 5.2 hard rule: presentational controls are CRM-agnostic. Values in,
    // events out. This rule is the enforcement mechanism, not code review.
    files: [
      "shared/controls/presentational/**/*.{ts,tsx}",
      "shared/components/presentational/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/context/**",
                "**/metadata/**",
                "**/data/**",
                "**/queries/**",
                "**/LibraryUtils*",
                "**/controls/smart/**",
              ],
              message:
                "Presentational controls are CRM-agnostic: no context, no metadata, no Web API, no smart-tier imports. Supplied values and events only.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "Xrm",
          message:
            "Presentational controls must not touch Xrm. CRM access belongs to smart controls and ViewModels.",
        },
      ],
    },
  }
);

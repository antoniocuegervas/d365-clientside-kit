import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook is the kit's visual contract. Presentational controls run on
 * fixture data with no host. The "Smart Controls" section additionally runs the
 * metadata-aware controls against an in-memory metadata fake (no Dataverse), so
 * their label/option/format/lookup resolution is visible without an org. Story
 * files live under tests/storybook mirroring the shared/ structure.
 */
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../tests/storybook/**/*.stories.tsx"],
  // addon-docs renders an autodocs page per component with the source under each
  // sample (enabled in preview.tsx).
  addons: ["@storybook/addon-docs"],
};

export default config;

import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook is the kit's visual contract: presentational controls
 * only, fixture data only, zero CRM mocks. Story files live under
 * tests/storybook mirroring the shared/ structure.
 */
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../tests/storybook/**/*.stories.tsx"],
  addons: [],
};

export default config;

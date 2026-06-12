import * as React from "react";
import type { Preview } from "@storybook/react-vite";
import { FluentProvider } from "@fluentui/react-components";
import { d365Theme } from "../shared/theme/d365Theme";

/**
 * Every story renders inside the kit theme, exactly what the clientui shell
 * and PCF roots do, so Storybook IS the side-by-side review surface.
 */
const preview: Preview = {
  decorators: [
    (Story) => (
      <FluentProvider theme={d365Theme}>
        <div style={{ maxWidth: 720, padding: 16 }}>
          <Story />
        </div>
      </FluentProvider>
    ),
  ],
  parameters: {
    layout: "padded",
  },
};

export default preview;

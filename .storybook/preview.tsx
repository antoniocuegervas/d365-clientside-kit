import * as React from "react";
import type { Preview } from "@storybook/react-vite";
import { FluentProvider, tokens } from "@fluentui/react-components";
import { d365Theme } from "../shared/theme/d365Theme";

/**
 * Every story renders inside the kit theme, exactly what the clientui shell
 * and PCF roots do, so Storybook IS the side-by-side review surface.
 */
const preview: Preview = {
  // Every component gets an autodocs page; the source shows expanded under each
  // sample so the code is browsable next to the rendered control.
  tags: ["autodocs"],
  decorators: [
    (Story, context) => (
      // Paint the kit's neutral surface so controls render on the light app
      // background, not the bare Storybook canvas. Fill the viewport only in the
      // Canvas view: on Docs pages each story is embedded, so a 100vh fill would
      // make every block a full screen tall and push the code far below it.
      <FluentProvider
        theme={d365Theme}
        style={{
          backgroundColor: tokens.colorNeutralBackground1,
          minHeight: context.viewMode === "docs" ? undefined : "100vh",
        }}
      >
        <div style={{ maxWidth: 720, padding: 16 }}>
          <Story />
        </div>
      </FluentProvider>
    ),
  ],
  parameters: {
    layout: "padded",
    docs: { source: { state: "open" } },
    // Sidebar order: the Overview lands first, then the metadata-aware smart tier
    // (the headline of the kit), then the presentational controls it builds on,
    // then the composed sample patterns.
    options: {
      storySort: {
        order: ["Overview", "Smart Controls", "Presentational Controls", "Sample Patterns"],
      },
    },
  },
};

export default preview;

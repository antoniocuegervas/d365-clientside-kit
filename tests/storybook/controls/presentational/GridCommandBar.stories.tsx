import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { GridCommandBar } from "../../../../shared/controls/presentational/GridCommandBar";

const meta: Meta<typeof GridCommandBar> = {
  title: "Presentational Controls/GridCommandBar",
  component: GridCommandBar,
  parameters: {
    docs: {
      description: {
        component:
          "Command bar for a grid, the native ribbon's common actions (New / Delete / Refresh). " +
          "Presentational: it shows the supplied selection count and raises intent. Delete is " +
          "enabled only when rows are selected, and the host confirms the destructive delete " +
          "before acting. Each action appears only when its handler is supplied.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof GridCommandBar>;

const noop = () => undefined;

export const NoSelection: Story = {
  name: "No selection (Delete disabled)",
  render: () => (
    <GridCommandBar selectedCount={0} onNew={noop} onDelete={noop} onRefresh={noop} />
  ),
};

export const WithSelection: Story = {
  name: "Rows selected (Delete shows the count)",
  render: () => (
    <GridCommandBar selectedCount={3} onNew={noop} onDelete={noop} onRefresh={noop} />
  ),
};

/** Selection count from a live Observable, the way a grid feeds it. */
export const LiveCount: Story = {
  name: "Live selection count",
  render: () => {
    const count = new Observable(0);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <GridCommandBar selectedCount={count} onNew={noop} onDelete={noop} onRefresh={noop} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => (count.value += 1)}>Select one more</button>
          <button onClick={() => (count.value = 0)}>Clear</button>
        </div>
      </div>
    );
  },
};

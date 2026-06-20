import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PersonaList } from "../../../../shared/controls/presentational/PersonaList";
import { personas } from "../../fixtures";

const meta: Meta<typeof PersonaList> = {
  title: "Presentational Controls/PersonaList",
  component: PersonaList,
  parameters: {
    docs: {
      description: {
        component:
          "Persona list for contact or user layouts the native form cannot host. Items are " +
          "supplied by the host; click handling is the host's.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof PersonaList>;

export const Default: Story = {
  render: () => <PersonaList items={personas} />,
};
export const Clickable: Story = {
  render: () => <PersonaList items={personas} onItemClick={() => {}} />,
};
export const Empty: Story = {
  render: () => <PersonaList items={[]} emptyMessage="No stakeholders yet." />,
};

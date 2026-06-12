import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { SelectionTree } from "../../../../shared/controls/presentational/SelectionTree";
import { territoryNodes } from "../../fixtures";

const meta: Meta<typeof SelectionTree> = {
  title: "Controls/SelectionTree",
  component: SelectionTree,
};
export default meta;
type Story = StoryObj<typeof SelectionTree>;

const make = (initial: string[]) => {
  const checkedIds = new Observable<string[]>(initial);
  return { checkedIds, onCheckedChange: (ids: string[]) => (checkedIds.value = ids) };
};

export const Empty: Story = {
  render: () => <SelectionTree nodes={territoryNodes} {...make([])} />,
};
export const WithSelection: Story = {
  render: () => <SelectionTree nodes={territoryNodes} {...make(["uk", "london"])} />,
};
export const Disabled: Story = {
  render: () => <SelectionTree nodes={territoryNodes} disabled {...make(["de"])} />,
};
export const NoCascade: Story = {
  name: "Independent nodes (no child cascade)",
  render: () => <SelectionTree nodes={territoryNodes} cascadeChildren={false} {...make([])} />,
};

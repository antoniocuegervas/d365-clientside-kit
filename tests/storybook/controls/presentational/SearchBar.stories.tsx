import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { SearchBar } from "../../../../shared/controls/presentational/SearchBar";

const meta: Meta<typeof SearchBar> = {
  title: "Presentational Controls/SearchBar",
  component: SearchBar,
  parameters: {
    docs: {
      description: {
        component:
          "Search command bar: text in, onSearch out. The host runs the query when onSearch " +
          "fires and renders the results wherever it likes.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof SearchBar>;

export const Default: Story = {
  render: () => <SearchBar searchText={new Observable("")} placeholder="Search accounts" />,
};
export const Prefilled: Story = {
  render: () => <SearchBar searchText={new Observable("contoso")} />,
};
export const Disabled: Story = {
  render: () => <SearchBar searchText={new Observable("")} disabled />,
};
export const BoxOnly: Story = {
  name: "Search-as-you-type (no button)",
  render: () => <SearchBar searchText={new Observable("")} showButton={false} />,
};

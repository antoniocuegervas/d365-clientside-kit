import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import {
  SelectionTree,
  type ITreeNode,
} from "../../../../shared/controls/presentational/SelectionTree";
import { territoryNodes } from "../../fixtures";

const meta: Meta<typeof SelectionTree> = {
  title: "Presentational Controls/SelectionTree",
  component: SelectionTree,
  parameters: {
    docs: {
      description: {
        component:
          "Hierarchical multi-select tree. Nodes are supplied and the checked set is host-owned; " +
          "the tree only renders and raises change events.",
      },
    },
  },
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

// Six levels deep (Global > EMEA > UK > England > London > City of London), where
// the shared territory fixture stops at three, to pin how the indent stacks.
const deepNodes: ITreeNode[] = [
  {
    id: "global",
    label: "Global",
    children: [
      {
        id: "emea",
        label: "EMEA",
        children: [
          {
            id: "uk",
            label: "United Kingdom",
            children: [
              {
                id: "england",
                label: "England",
                children: [
                  {
                    id: "london",
                    label: "London",
                    children: [{ id: "city-of-london", label: "City of London" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

export const DeepNesting: Story = {
  name: "Deep nesting (six levels)",
  render: () => <SelectionTree nodes={deepNodes} {...make(["london", "city-of-london"])} />,
};

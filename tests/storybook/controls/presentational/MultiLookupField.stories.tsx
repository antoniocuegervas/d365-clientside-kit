import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { MultiLookupField } from "../../../../shared/controls/presentational/MultiLookupField";
import type { IEntityReference } from "../../../../shared/utils/EntityModel";
import { contactRefs } from "../../fixtures";

const meta: Meta<typeof MultiLookupField> = {
  title: "Controls/MultiLookupField",
  component: MultiLookupField,
};
export default meta;
type Story = StoryObj<typeof MultiLookupField>;

const make = (initial: IEntityReference[]) => {
  const selected = new Observable<IEntityReference[]>(initial);
  const results = new Observable<IEntityReference[]>([]);
  return {
    selected,
    results,
    onSearchTextChanged: (text: string) => {
      results.value = contactRefs.filter((r) =>
        (r.name ?? "").toLowerCase().includes(text.toLowerCase())
      );
    },
    onChange: (v: IEntityReference[]) => (selected.value = v),
  };
};

export const Empty: Story = {
  render: () => <MultiLookupField label="Stakeholders" {...make([])} />,
};
export const Filled: Story = {
  render: () => <MultiLookupField label="Stakeholders" {...make([contactRefs[0], contactRefs[1]])} />,
};
export const Required: Story = {
  render: () => <MultiLookupField label="Stakeholders" required {...make([])} />,
};
export const Disabled: Story = {
  render: () => <MultiLookupField label="Stakeholders" disabled {...make([contactRefs[0]])} />,
};
export const ReadOnly: Story = {
  render: () => <MultiLookupField label="Stakeholders" readOnly {...make(contactRefs)} />,
};
export const WithError: Story = {
  render: () => (
    <MultiLookupField label="Stakeholders" errorMessage="Add at least one stakeholder." {...make([])} />
  ),
};

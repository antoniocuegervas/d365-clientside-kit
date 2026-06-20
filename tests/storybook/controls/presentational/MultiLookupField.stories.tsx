import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { MultiLookupField } from "../../../../shared/controls/presentational/MultiLookupField";
import type { IEntityReference } from "../../../../shared/utils/EntityModel";
import { contactRefs } from "../../fixtures";

const meta: Meta<typeof MultiLookupField> = {
  title: "Presentational Controls/MultiLookupField",
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

/** Required variant: the validation message clears once a stakeholder is added. */
const makeRequired = () => {
  const selected = new Observable<IEntityReference[]>([]);
  const results = new Observable<IEntityReference[]>([]);
  const errorMessage = new Observable<string | undefined>("Add at least one stakeholder.");
  return {
    selected,
    results,
    errorMessage,
    onSearchTextChanged: (text: string) => {
      results.value = contactRefs.filter((r) =>
        (r.name ?? "").toLowerCase().includes(text.toLowerCase())
      );
    },
    onChange: (v: IEntityReference[]) => {
      selected.value = v;
      errorMessage.value = v.length === 0 ? "Add at least one stakeholder." : undefined;
    },
  };
};

export const Empty: Story = {
  render: () => <MultiLookupField label="Stakeholders" {...make([])} />,
};
export const Filled: Story = {
  render: () => <MultiLookupField label="Stakeholders" {...make([contactRefs[0], contactRefs[1]])} />,
};
export const Required: Story = {
  render: () => <MultiLookupField label="Stakeholders" required {...makeRequired()} />,
};
export const Disabled: Story = {
  render: () => <MultiLookupField label="Stakeholders" disabled {...make([contactRefs[0]])} />,
};
export const ReadOnly: Story = {
  render: () => <MultiLookupField label="Stakeholders" readOnly {...make(contactRefs)} />,
};

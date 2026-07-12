import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { MultiLookupField } from "../../../../shared/controls/presentational/MultiLookupField";
import type { IEntityReference } from "../../../../shared/utils/EntityModel";
import { contactRefs } from "../../fixtures";

const meta: Meta<typeof MultiLookupField> = {
  title: "Presentational Controls/MultiLookupField",
  component: MultiLookupField,
  parameters: {
    docs: {
      description: {
        component:
          "Multi-valued lookup (a tag-picker shape). Same search round-trip as LookupField: " +
          "`onSearchTextChanged` out, `results` in, with the selection as an array of entity " +
          "references. It has no smart counterpart: the ViewModel supplies the results and " +
          "owns how the selection is persisted (an N:N, a party list, whatever the schema " +
          "models), so this control is bound directly from the View.",
      },
    },
  },
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

/** Five selected records, two with long names, to pin the tag row on an editable field. */
const manyStakeholders: IEntityReference[] = [
  {
    id: "a1a00000-0000-0000-0000-000000000010",
    logicalName: "account",
    name: "Adventure Works Northwest Distribution Center",
  },
  {
    id: "a1a00000-0000-0000-0000-000000000011",
    logicalName: "account",
    name: "Contoso Pharmaceuticals Regional Fulfillment Hub",
  },
  { id: "c1c00000-0000-0000-0000-000000000012", logicalName: "contact", name: "Yvonne McKay" },
  { id: "c1c00000-0000-0000-0000-000000000013", logicalName: "contact", name: "Patrick Sands" },
  { id: "c1c00000-0000-0000-0000-000000000014", logicalName: "contact", name: "Susanna Stubberod" },
];

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
export const ManyTags: Story = {
  name: "Many tags (long names, editable)",
  render: () => {
    // Editable (no disabled/readOnly), five tags with two long names, so the tag
    // row's wrapping shows: the tags flow onto more rows instead of panning off the edge.
    const selected = new Observable<IEntityReference[]>(manyStakeholders);
    const results = new Observable<IEntityReference[]>([]);
    return (
      <MultiLookupField
        label="Stakeholders"
        selected={selected}
        results={results}
        onSearchTextChanged={(text) =>
          (results.value = manyStakeholders.filter((r) =>
            (r.name ?? "").toLowerCase().includes(text.toLowerCase())
          ))
        }
        onChange={(v) => (selected.value = v)}
      />
    );
  },
};

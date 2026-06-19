import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { LookupField } from "../../../../shared/controls/presentational/LookupField";
import type { IEntityReference } from "../../../../shared/utils/EntityModel";
import { accountRefs } from "../../fixtures";

const meta: Meta<typeof LookupField> = {
  title: "Controls/LookupField",
  component: LookupField,
};
export default meta;
type Story = StoryObj<typeof LookupField>;

/**
 * The story plays the ViewModel: it "searches" the fixture array when the
 * control raises onSearchTextChanged. In production that handler runs a
 * FetchXML query, the control never knows the difference.
 */
const make = (initial: IEntityReference | null) => {
  const selected = new Observable<IEntityReference | null>(initial);
  const results = new Observable<IEntityReference[]>([]);
  return {
    selected,
    results,
    onSearchTextChanged: (text: string) => {
      results.value = accountRefs.filter((r) =>
        (r.name ?? "").toLowerCase().includes(text.toLowerCase())
      );
    },
    onChange: (v: IEntityReference | null) => (selected.value = v),
  };
};

/** Required variant: the validation message clears once a record is chosen. */
const makeRequired = () => {
  const selected = new Observable<IEntityReference | null>(null);
  const results = new Observable<IEntityReference[]>([]);
  const errorMessage = new Observable<string | undefined>("Select a parent account.");
  return {
    selected,
    results,
    errorMessage,
    onSearchTextChanged: (text: string) => {
      results.value = accountRefs.filter((r) =>
        (r.name ?? "").toLowerCase().includes(text.toLowerCase())
      );
    },
    onChange: (v: IEntityReference | null) => {
      selected.value = v;
      errorMessage.value = v ? undefined : "Select a parent account.";
    },
  };
};

export const Empty: Story = {
  render: () => <LookupField label="Parent Account" {...make(null)} />,
};
export const Filled: Story = {
  render: () => <LookupField label="Parent Account" {...make(accountRefs[0])} />,
};
export const Required: Story = {
  render: () => <LookupField label="Parent Account" required {...makeRequired()} />,
};
export const Disabled: Story = {
  render: () => <LookupField label="Parent Account" disabled {...make(accountRefs[1])} />,
};
export const ReadOnly: Story = {
  render: () => <LookupField label="Parent Account" readOnly {...make(accountRefs[1])} />,
};
export const WithError: Story = {
  render: () => (
    <LookupField label="Parent Account" errorMessage="Select a parent account." {...make(null)} />
  ),
};
export const Searching: Story = {
  name: "Busy state while host searches",
  render: () => <LookupField label="Parent Account" searching {...make(null)} />,
};
export const DialogMode: Story = {
  name: "Dialog mode (Browse → native picker)",
  render: () => {
    const selected = new Observable<IEntityReference | null>(accountRefs[0]);
    const results = new Observable<IEntityReference[]>([]);
    return (
      <LookupField
        label="Parent Account"
        mode="dialog"
        selected={selected}
        results={results}
        onBrowse={() => (selected.value = accountRefs[(accountRefs.indexOf(selected.value!) + 1) % accountRefs.length])}
        onChange={(v) => (selected.value = v)}
      />
    );
  },
};
export const WithIcons: Story = {
  name: "Inline results with entity icons",
  render: () => {
    const selected = new Observable<IEntityReference | null>(null);
    const withIcon = accountRefs.map((r) => ({
      ...r,
      iconUrl:
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="3" fill="%230078d4"/></svg>'
        ),
    }));
    const results = new Observable<IEntityReference[]>([]);
    return (
      <LookupField
        label="Parent Account"
        selected={selected}
        results={results}
        onSearchTextChanged={(text) =>
          (results.value = withIcon.filter((r) =>
            (r.name ?? "").toLowerCase().includes(text.toLowerCase())
          ))
        }
        onChange={(v) => (selected.value = v)}
      />
    );
  },
};

import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@fluentui/react-components";
import { Observable } from "../../../../shared/reactivity/Observable";
import { ObservableArray } from "../../../../shared/reactivity/ObservableArray";
import { DataGrid, type IGridRow } from "../../../../shared/controls/presentational/DataGrid";
import { accountColumns, accountRows } from "../../fixtures";

const meta: Meta<typeof DataGrid> = {
  title: "Presentational Controls/DataGrid",
  component: DataGrid,
  parameters: {
    docs: {
      description: {
        component:
          "Read-only data grid, the limitation-bypass control. Renders supplied rows " +
          "with native model-driven grid styling; where the rows come from (a single view, " +
          "merged queries, normalized activities) is entirely the host's business. Supports " +
          "row selection, multi-select, client or server sort, and a loading skeleton.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof DataGrid>;

export const Default: Story = {
  render: () => <DataGrid columns={accountColumns} rows={accountRows} />,
};

export const Loading: Story = {
  render: () => <DataGrid columns={accountColumns} rows={[]} loading />,
};

export const Empty: Story = {
  render: () => (
    <DataGrid columns={accountColumns} rows={[]} emptyMessage="No accounts found." />
  ),
};

export const RowSelection: Story = {
  name: "Row click + host-owned selection",
  render: () => {
    const selectedKey = new Observable<string | null>(null);
    return (
      <DataGrid
        columns={accountColumns}
        rows={accountRows}
        selectedKey={selectedKey}
        onRowClick={(row: IGridRow) => (selectedKey.value = row.key)}
      />
    );
  },
};

/**
 * Rows held in an ObservableArray. The buttons change the list through its own
 * methods, and the grid updates on its own (it is observing the list), with no
 * new prop passed in. Editing a row uses updateAt, which returns a new row, so
 * the cell refreshes.
 */
const ObservableArrayDemo: React.FC = () => {
  const rows = React.useRef(new ObservableArray<IGridRow>(accountRows)).current;
  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", gap: "8px" }}>
        <Button onClick={() => rows.updateAt(0, (r) => ({ ...r, name: `${String(r.name)} (edited)` }))}>
          Edit first row
        </Button>
        <Button
          onClick={() =>
            rows.push({ key: `new-${rows.length}`, name: "New Account", city: "Somewhere", phone: "", revenue: 0 })
          }
        >
          Add a row
        </Button>
        <Button onClick={() => rows.removeAt(0)}>Remove first row</Button>
      </div>
      <DataGrid columns={accountColumns} rows={rows} />
    </div>
  );
};

export const ObservableArrayRows: Story = {
  name: "Rows in an ObservableArray (live per-row edit)",
  render: () => <ObservableArrayDemo />,
};

export const AsyncRows: Story = {
  name: "Rows arrive async (loading handoff)",
  render: () => {
    const rows = new Observable<IGridRow[]>([]);
    const loading = new Observable<boolean>(true);
    setTimeout(() => {
      rows.value = accountRows;
      loading.value = false;
    }, 1500);
    return <DataGrid columns={accountColumns} rows={rows} loading={loading} />;
  },
};

export const MultiSelect: Story = {
  name: "Multi-select + invoke (double-click)",
  render: () => {
    const selectedKeys = new Observable<string[]>([]);
    return (
      <DataGrid
        columns={accountColumns}
        rows={accountRows}
        multiSelect
        selectedKeys={selectedKeys}
        onItemInvoked={(row: IGridRow) => window.alert(`Open ${String(row.name)}`)}
      />
    );
  },
};

export const ServerSort: Story = {
  name: "Server-sort mode (controlled indicator)",
  render: () => {
    const sortState = new Observable<{ columnKey: string; descending: boolean } | null>({
      columnKey: "name",
      descending: false,
    });
    return (
      <DataGrid
        columns={accountColumns}
        rows={accountRows}
        sortState={sortState}
        onColumnSort={(columnKey, descending) => (sortState.value = { columnKey, descending })}
      />
    );
  },
};

export const CustomCellRender: Story = {
  render: () => (
    <DataGrid
      columns={[
        {
          key: "name",
          name: "Account Name",
          width: 240,
          onRender: (row) => <strong>{String(row.name)}</strong>,
        },
        ...accountColumns.slice(1),
      ]}
      rows={accountRows}
    />
  ),
};

import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { DataGrid, type IGridRow } from "../../../../shared/controls/presentational/DataGrid";
import { accountColumns, accountRows } from "../../fixtures";

const meta: Meta<typeof DataGrid> = {
  title: "Controls/DataGrid",
  component: DataGrid,
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

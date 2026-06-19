import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataGrid } from "../../../shared/controls/presentational/DataGrid";
import {
  activityColumns,
  activityRows,
  mergedOpportunityColumns,
  mergedOpportunityRows,
} from "../fixtures";

/**
 * The canonical "why not native" demos.
 *
 * Side-by-side review checklist: compare against a native read-only subgrid
 * on a UCI form, header weight/color, row height, hover, sort indicators
 * must be indistinguishable. Only the DATA is impossible natively.
 */
const meta: Meta<typeof DataGrid> = {
  title: "Scenarios/Limitation Bypass",
  component: DataGrid,
};
export default meta;
type Story = StoryObj<typeof DataGrid>;

export const MergedMultiQueryGrid: Story = {
  name: "Merged multi-query grid",
  render: () => (
    <DataGrid
      columns={mergedOpportunityColumns}
      rows={mergedOpportunityRows}
      emptyMessage="No opportunities found."
    />
  ),
};

export const MultiActivityTypeList: Story = {
  name: "Unified multi-activity-type list",
  render: () => (
    <DataGrid
      columns={activityColumns}
      rows={activityRows}
      emptyMessage="No activities found."
    />
  ),
};

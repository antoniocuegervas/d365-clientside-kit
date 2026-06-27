import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../shared/reactivity/Observable";
import { SmartViewGrid, type ISortSpec } from "../../../shared/controls/smart/SmartViewGrid";
import {
  gridContext,
  pagedGridContext,
  gridViewId,
  withContext,
  sample,
} from "./smartStoryHarness";

const meta: Meta<typeof SmartViewGrid> = {
  title: "Smart Controls/SmartViewGrid",
  component: SmartViewGrid,
  decorators: [withContext(gridContext)],
  parameters: {
    docs: {
      description: {
        component:
          "Read-only grid bound to a saved view (a savedquery, the same system or personal views " +
          "you manage in the model-driven app). The view supplies the column layout (layoutjson) " +
          "and the query; headers resolve from attribute metadata, so the grid reads as native. " +
          "Start with `entity` plus `viewName` (or `viewId`); everything else is additive: " +
          "`pageSize` (with `pagination=\"rich\"` for jump-to-page and totals) for paging, " +
          "`serverSort` for sortable headers, `overrideFetchXml` to feed a host-supplied query " +
          "while keeping the view's layout, and `quickFind` / `filters` / `multiSelect` Observables " +
          "a ViewModel drives. See the Company Search sample for live quick find, and the " +
          "Activities grid for activitypointer type routing. Runs against an in-memory metadata " +
          "fake (no org); each story's Show code panel shows the host wiring.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof SmartViewGrid>;

const accountOrderBy = new Observable<ISortSpec | null>(null);
const hostFetchXml = new Observable<string | null>(
  "<fetch><entity name='account'><attribute name='name'/><attribute name='telephone1'/></entity></fetch>"
);

export const Default: Story = {
  name: "Default (the entity's default view)",
  render: () => <SmartViewGrid entity="account" />,
  parameters: sample(
    `// With no viewId/viewName the grid loads the entity's default view: its
// columns become the headers (resolved from metadata) and its query supplies
// the rows. Here the seeded "Active Accounts" view defines Name + Main Phone.
<SmartViewGrid entity="account" />`,
    "The grid reads a saved view: column layout and the query both come from the view, headers resolve from attribute metadata."
  ),
};

export const ViewByName: Story = {
  name: "A specific view (by view name)",
  render: () => <SmartViewGrid entity="account" viewName="Key Accounts" />,
  parameters: sample(
    `// viewName points the grid at a named saved view, resolved at runtime
// (getViewByName). The "Key Accounts" view has a different layout (Name +
// City), so the grid renders different columns without any other change.
<SmartViewGrid entity="account" viewName="Key Accounts" />`,
    "viewName resolves a saved view by its display name; the grid renders whatever columns that view defines. Prefer viewId in production when the view could be renamed or its name localized, since name resolution fails once the name no longer matches."
  ),
};

export const ViewById: Story = {
  name: "A specific view (by view id)",
  render: () => <SmartViewGrid entity="account" viewId={gridViewId} />,
  parameters: sample(
    `// viewId pins the grid to a saved view by its stable saved-query id, so a
// rename cannot break it. This three-column view (Name + Main Phone + City)
// resolves straight from the id, with no name lookup.
<SmartViewGrid entity="account" viewId="77770000-0000-0000-0000-000000000007" />`,
    "viewId pins the grid to a saved view by its stable id (no name lookup), so renaming the view will not break it."
  ),
};

export const Paging: Story = {
  name: "Server-side paging",
  decorators: [withContext(pagedGridContext)],
  render: () => <SmartViewGrid entity="account" pageSize={2} />,
  parameters: sample(
    `// pageSize turns on server-side paging and a pager. Simple paging (the
// default) follows the @odata.nextLink forward, and caches visited pages so
// "previous" is instant. The page size travels as odata.maxpagesize, not $top.
<SmartViewGrid entity="account" pageSize={2} />`,
    "Setting pageSize pages the view server-side. The Next button follows the result's nextLink; visited pages are cached for instant Previous. For jump-to-any-page and a total count, also pass pagination=\"rich\" (FetchXML page/count, the only server-side random-access paging in Dataverse); simple mode is forward/back only."
  ),
};

export const ServerSort: Story = {
  name: "Server sort on header click",
  render: () => <SmartViewGrid entity="account" orderBy={accountOrderBy} serverSort />,
  parameters: sample(
    `// serverSort makes header clicks sort on the server by re-querying with
// $orderby. The optional orderBy Observable lets the ViewModel seed the initial
// sort or read the current one; without it the grid keeps its own sort state.
const orderBy = new Observable<ISortSpec | null>(null);

<SmartViewGrid entity="account" orderBy={orderBy} serverSort />`,
    "serverSort re-queries with $orderby on each header click (the grid never sorts a loaded page in memory). orderBy is optional, for seeding or reading the sort. Only root-entity, non-lookup columns are sortable: link-entity, aliased, and lookup columns cannot ride the saved-query $orderby, so their headers stay unsortable."
  ),
};

export const OverrideFetchXml: Story = {
  name: "Host-supplied query (overrideFetchXml)",
  render: () => <SmartViewGrid entity="account" overrideFetchXml={hostFetchXml} />,
  parameters: sample(
    `// overrideFetchXml is the "native look, custom data" path: the view still
// supplies the column layout, but the host owns the query. Put a FetchXML
// string in the Observable and the grid runs it instead of the saved query,
// so a ViewModel can merge sources, add link-entities, or filter however it
// likes while the grid keeps the standard view chrome. Reassign the Observable's
// value (fetchXml.value = nextQuery) to re-query reactively, e.g. on a filter
// change. In override mode the host owns the whole query, so the grid does not
// layer quickFind, filters, or server sort on top: bake those into the FetchXML.
const fetchXml = new Observable<string | null>(
  "<fetch><entity name='account'>" +
    "<attribute name='name'/><attribute name='telephone1'/>" +
    "</entity></fetch>"
);

<SmartViewGrid entity="account" overrideFetchXml={fetchXml} />`,
    "overrideFetchXml keeps the view's layout but swaps in a host-supplied query (merged sources, custom link-entities, bespoke filters). The host owns the whole query, so quickFind, filters, and server sort are not applied on top; bake them into the FetchXML, and reassign the Observable to re-query reactively."
  ),
};

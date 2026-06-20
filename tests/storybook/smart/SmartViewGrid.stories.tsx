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
          "Read-only grid bound to a saved view: the view supplies the column layout and the " +
          "query, and the headers resolve from attribute metadata. Point it at a specific view by " +
          "`viewName` or `viewId`, turn on server-side paging or sorting for large lists, or hand " +
          "it a host-supplied query with `overrideFetchXml` while keeping the view's layout. Runs " +
          "against an in-memory metadata fake (no Dataverse host); each story's Show code panel " +
          "shows the host wiring.",
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
    "viewName resolves a saved view by its display name; the grid renders whatever columns that view defines."
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
    "Setting pageSize pages the view server-side. The Next button follows the result's nextLink; visited pages are cached for instant Previous."
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
    "serverSort re-queries with $orderby on each header click (the grid never sorts a loaded page in memory). orderBy is optional, for seeding or reading the sort."
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
// likes while the grid keeps the standard view chrome.
const fetchXml = new Observable<string | null>(
  "<fetch><entity name='account'>" +
    "<attribute name='name'/><attribute name='telephone1'/>" +
    "</entity></fetch>"
);

<SmartViewGrid entity="account" overrideFetchXml={fetchXml} />`,
    "overrideFetchXml keeps the view's layout but swaps in a host-supplied query. This is how a ViewModel feeds the grid data no single saved view could produce (merged sources, custom link-entities, bespoke filters)."
  ),
};

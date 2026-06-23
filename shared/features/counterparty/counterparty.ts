import type { IViewModelContext } from "../../context/IViewModelContext";
import { LibraryUtils } from "../../utils/LibraryUtils";
import { normalizeGuid } from "../../utils/EntityModel";
import type { IGridRow } from "../../controls/presentational/DataGrid";

/**
 * The counterparty grid's party logic, shared by the sample app (Web API data)
 * and the dataset PCF. A cross-type activity list shows one row per
 * activitypointer record (the shared activity table), but WHO is on the other
 * end and in WHAT role live on the activityparty rows (the participationtypemask
 * field), not on activitypointer itself. So for the page of activities a surface
 * hands us, we run one activityparty query and synthesize a counterparty + role
 * per activity.
 *
 * The trick is classifying each party by its TARGET TYPE (account/contact =
 * external, systemuser/team/queue = internal), not by direction (directioncode
 * lives only on the per-type tables like phonecall and email, not on
 * activitypointer). That covers every activity type, custom ones included, with
 * no per-type code.
 *
 * Honest limits, all render-time: an internal-only activity (a task between two
 * users) has no counterparty and shows blank; a multi-party activity (an email to
 * several) shows the first external party plus a "(+N more)" count; non-person
 * targets (knowledgearticle, equipment) are not counterparties and are ignored.
 */

//#region party classification

/** Party target types that count as the external "other end" of an activity. */
const EXTERNAL_PARTY_TYPES = new Set(["account", "contact"]);
/** Party target types internal to the org, never a counterparty. */
const INTERNAL_PARTY_TYPES = new Set(["systemuser", "team", "queue"]);

type PartyClass = "external" | "internal" | "other";

/**
 * participationtypemask for the "Regarding" party, the record the activity is
 * filed under. On the account's Activities subgrid that party IS the host
 * account, so it is never the counterparty (the other end), and it comes back
 * with no inline name. It is excluded from counterparty candidates below.
 */
const REGARDING_TYPEMASK = 8;

function classifyParty(targetEntity: string): PartyClass {
  if (EXTERNAL_PARTY_TYPES.has(targetEntity)) {
    return "external";
  }
  if (INTERNAL_PARTY_TYPES.has(targetEntity)) {
    return "internal";
  }
  // knowledgearticle, equipment, bookableresource, any custom party target.
  return "other";
}

//#endregion

interface IParty {
  activityId: string;
  partyId: string;
  partyEntity: string;
  name: string;
  role: string;
  roleCode: number | null;
  partyClass: PartyClass;
}

/** One external party on an activity, navigable to its account/contact record. */
export interface ICounterpartyParty {
  id: string;
  entity: string;
  name: string;
  /** Role label (its participationtypemask, e.g. "To Recipient"). */
  role: string;
}

/** The synthesized counterparty + role for one activity, for the grid row. */
export interface ICounterpartyInfo {
  /** Summary text for sorting and the compact persona view. "" when internal-only. */
  counterparty: string;
  /** Role label of the lead (first) counterparty. */
  role: string;
  /** All external parties, ordered by role; the cell links the lead + a "(+N more)". */
  parties: ICounterpartyParty[];
}

// The name, target type, and role all ride back inline as annotations on the one
// activityparty query, so there are no per-party follow-up lookups.
const PARTY_NAME = "_partyid_value@OData.Community.Display.V1.FormattedValue";
const PARTY_TYPE = "_partyid_value@Microsoft.Dynamics.CRM.lookuplogicalname";
const ROLE_LABEL = "participationtypemask@OData.Community.Display.V1.FormattedValue";

function toParty(record: Record<string, unknown>): IParty {
  const partyEntity = String(record[PARTY_TYPE] ?? "");
  const roleCode = record.participationtypemask;
  return {
    activityId: normalizeGuid(String(record._activityid_value ?? "")),
    partyId: normalizeGuid(String(record._partyid_value ?? "")),
    partyEntity,
    name: (record[PARTY_NAME] as string) ?? "",
    role: (record[ROLE_LABEL] as string) ?? "",
    roleCode: typeof roleCode === "number" ? roleCode : null,
    partyClass: classifyParty(partyEntity),
  };
}

/**
 * Reduces one activity's parties to its counterparty. External parties lead by
 * role code (Sender, then To, then the rest) so the choice is deterministic and
 * the most meaningful party shows; a second external party becomes "(+N more)".
 */
function summarize(parties: IParty[]): ICounterpartyInfo {
  const external = parties
    .filter((party) => party.partyClass === "external" && party.roleCode !== REGARDING_TYPEMASK)
    .sort((a, b) => (a.roleCode ?? 99) - (b.roleCode ?? 99) || a.name.localeCompare(b.name));
  if (external.length === 0) {
    return { counterparty: "", role: "", parties: [] };
  }
  const list: ICounterpartyParty[] = external.map((party) => ({
    id: party.partyId,
    entity: party.partyEntity,
    name: party.name || "(unnamed)",
    role: party.role,
  }));
  const [first, ...rest] = list;
  return {
    counterparty: rest.length > 0 ? `${first.name} (+${rest.length} more)` : first.name,
    role: first.role,
    parties: list,
  };
}

/**
 * Resolves counterparty + role for the page of activities a surface is showing.
 * One query for the whole page (no N+1), grouped and summarized per activity.
 * Returns a map keyed by normalized activity id.
 */
export async function resolveCounterparties(
  context: IViewModelContext,
  activityIds: string[]
): Promise<Map<string, ICounterpartyInfo>> {
  const ids = [...new Set(activityIds.map((id) => normalizeGuid(id)).filter(Boolean))];
  if (ids.length === 0) {
    return new Map();
  }
  const result = await context.webAPI.fetch("activityparty", buildPartyFetch(ids));
  const byActivity = new Map<string, IParty[]>();
  for (const record of result.entities) {
    const party = toParty(record);
    if (!party.activityId) {
      continue;
    }
    const list = byActivity.get(party.activityId);
    if (list) {
      list.push(party);
    } else {
      byActivity.set(party.activityId, [party]);
    }
  }
  const resolved = new Map<string, ICounterpartyInfo>();
  for (const [activityId, parties] of byActivity) {
    resolved.set(activityId, summarize(parties));
  }
  return resolved;
}

/** FetchXML for the page's activityparty rows: the parties of these activities. */
function buildPartyFetch(activityIds: string[]): string {
  const values = activityIds
    .map((id) => `            <value>${LibraryUtils.escapeXml(id)}</value>`)
    .join("\n");
  return `
    <fetch version='1.0' output-format='xml-platform' mapping='logical' distinct='false'>
      <entity name='activityparty'>
        <attribute name='partyid' />
        <attribute name='participationtypemask' />
        <attribute name='addressused' />
        <attribute name='activityid' />
        <filter type='and'>
          <condition attribute='activityid' operator='in'>
${values}
          </condition>
        </filter>
      </entity>
    </fetch>`;
}

//#region grid rows

/** Row key the synthesized Counterparty cell reads (an ICounterpartyInfo). */
export const COUNTERPARTY_KEY = "kit_counterparty";

const EMPTY_INFO: ICounterpartyInfo = { counterparty: "", role: "", parties: [] };

/** Writes the resolved counterparty info onto a grid row. */
export function applyCounterparty(row: IGridRow, info: ICounterpartyInfo | undefined): IGridRow {
  row[COUNTERPARTY_KEY] = info ?? EMPTY_INFO;
  return row;
}

//#endregion

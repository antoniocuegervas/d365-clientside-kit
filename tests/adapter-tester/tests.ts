import type { IEntityMetadata, IViewModelContext, IWebApiRequest } from "../../shared/context/IViewModelContext";
import type { IOpsCollector, ITestCase, ITestOutcome, Scratch } from "./types";
import { LibraryUtils } from "../../shared/utils/LibraryUtils";
import { normalizeGuid } from "../../shared/utils/EntityModel";
import { CdsClient } from "../../shared/data/CdsClient";
import { CdsEntityMetadataProvider } from "../../shared/metadata/CdsEntityMetadataProvider";
import { attributeKind, findAttributeMetadata } from "../../shared/metadata/attributeMetadataReads";
import {
  LAB_CLASSIFIERS_ID,
  LAB_FETCHXML_ID,
  LAB_METADATA_ID,
  LAB_SECTION,
  LAB_SERVED_KEY,
  LAB_SWEEP_ID,
  LAB_V82_PREFIX,
  LAB_VERSIONS,
} from "./lab";

//#region outcome + host helpers

const pass = (detail: string): ITestOutcome => ({ status: "pass", detail });
const fail = (detail: string): ITestOutcome => ({ status: "fail", detail });
const skip = (detail: string): ITestOutcome => ({ status: "skip", detail });

const hostLabel = (ctx: IViewModelContext): string =>
  ctx.isLegacy ? "V8 (legacy CRM 8.x)" : "modern (UCI)";

/** The read channel the adapter uses for OData query strings, per host. */
const readVia = (ctx: IViewModelContext): string => (ctx.isLegacy ? "cds-client" : "Xrm.WebApi");

/** FetchXML rides the kit's own XHR client on EVERY host (native Xrm.WebApi drops annotations). */
const FETCH_VIA = "the kit XHR client (cds-client on every host)";

const FORMATTED_VALUE = "@OData.Community.Display.V1.FormattedValue";
const LOOKUP_LOGICAL_NAME = "@Microsoft.Dynamics.CRM.lookuplogicalname";

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;

const errText = (error: unknown): string =>
  error instanceof Error ? error.message : String(asRecord(error)?.message ?? error);

/** Web API version line matching the host, for raw probes and a fresh CdsClient. */
const apiVersion = (ctx: IViewModelContext): string => (ctx.isLegacy ? "8.2" : "9.2");

/** Web API root for raw probes, matching the host's version line. */
const apiBase = (ctx: IViewModelContext): string =>
  `${ctx.clientUrl.replace(/\/+$/, "")}/api/data/v${apiVersion(ctx)}/`;

/**
 * A fresh kit XHR client bound to this host's org. Defaults to the host's own
 * version line; the API version lab passes an explicit older line ("8.2") to
 * exercise the kit's real v8 client code against that endpoint's contract.
 */
const kitClient = (ctx: IViewModelContext, version?: string): CdsClient =>
  new CdsClient({ clientUrl: ctx.clientUrl, apiVersion: version ?? apiVersion(ctx) });

/**
 * True when the kit's client URL is the same origin as the page. The raw
 * platform probes (direct fetch / a fresh CdsClient) only work against the
 * hosting org's own origin with ambient credentials; off a real org (the unit
 * fake, an about:blank host) this is false and the probe skips.
 */
const sameOriginAsHost = (ctx: IViewModelContext): boolean => {
  try {
    return typeof window !== "undefined" && new URL(ctx.clientUrl).origin === window.location.origin;
  } catch {
    return false;
  }
};

/** True when a key carries a v8-era alias/annotation encoding token. */
const isEncodedKey = (key: string): boolean =>
  key.includes("_x002e_") || key.includes("_x0040_");

/** Classifies raw aliased key(s) as the modern dotted or the v8-encoded shape. */
function aliasShape(keys: string[]): string {
  if (keys.some((k) => k.startsWith("pc."))) {
    return "modern dotted (pc.contactid)";
  }
  if (keys.some((k) => k.includes("_x002e_"))) {
    return "v8 encoded (pc_x002e_contactid)";
  }
  return "unrecognized";
}

/**
 * Reports the platform's WIRE shape for a link-entity alias, verbatim, via a raw
 * same-origin fetch that bypasses the kit client (so the kit's own normalization
 * cannot mask what the engine sent). Off the hosting org (no same-origin, no
 * fetch) it says the raw probe is unavailable. The kit channel ASSERTS the
 * dotted shape; this only MEASURES the platform.
 */
async function rawAliasWireShape(
  ctx: IViewModelContext,
  fetchXml: string,
  ops: IOpsCollector,
  version?: string
): Promise<string> {
  if (!sameOriginAsHost(ctx) || typeof fetch !== "function") {
    return "(raw same-origin probe unavailable off the hosting org)";
  }
  const base = `${ctx.clientUrl.replace(/\/+$/, "")}/api/data/v${version ?? apiVersion(ctx)}/`;
  const url = `${base}${LibraryUtils.entitySetName("account")}?fetchXml=${encodeURIComponent(fetchXml)}`;
  const headers = { Accept: "application/json", Prefer: 'odata.include-annotations="*"' };
  ops.http("GET", url, headers);
  try {
    const response = await fetch(url, { method: "GET", credentials: "include", headers });
    if (!response.ok) {
      return `(raw probe returned HTTP ${response.status})`;
    }
    const body = asRecord(await response.json());
    const first = ((body?.value as Array<Record<string, unknown>> | undefined) ?? [])[0];
    if (!first) {
      return "(raw probe returned 0 rows)";
    }
    const rawKeys = Object.keys(first).filter((k) => k.toLowerCase().startsWith("pc"));
    ops.note(`raw wire aliased key(s): ${rawKeys.map((k) => JSON.stringify(k)).join(", ") || "(none)"}`);
    return `${aliasShape(rawKeys)} (raw: ${rawKeys.join(", ") || "(none)"})`;
  } catch (error) {
    return `(raw probe error: ${errText(error)})`;
  }
}

/** Deletes a created record, recording the outcome loudly (a leak must be visible). */
async function loudDelete(
  ctx: IViewModelContext,
  ops: IOpsCollector,
  entity: string,
  id: string | undefined
): Promise<{ failed: boolean; text: string }> {
  if (!id) {
    return { failed: false, text: `no ${entity} created, nothing to clean up` };
  }
  try {
    await ctx.webAPI.deleteRecord(entity, id);
    ops.note(`DELETE ${entity} ${id}: ok`);
    return { failed: false, text: `cleanup ok (deleted ${entity} ${id})` };
  } catch (error) {
    ops.note(`DELETE ${entity} ${id}: FAILED ${errText(error)}`);
    return { failed: true, text: `CLEANUP FAILED: ${entity} ${id} still exists (${errText(error)})` };
  }
}

//#endregion

//#region Context

const adapterSelection: ITestCase = {
  id: "t1-adapter-selection",
  title: "Adapter selection matches the org version",
  tier: 1,
  section: "Context",
  channel: "host-surface",
  run(ctx, _scratch, ops) {
    const version = ctx.orgVersion || "(unknown)";
    const major = Number(/^(\d+)/.exec(ctx.orgVersion ?? "")?.[1] ?? "");
    const detected = hostLabel(ctx);
    ops.note(`read orgVersion="${version}", isLegacy=${ctx.isLegacy}, resolved adapter=${detected}`);
    if (Number.isFinite(major)) {
      const expectLegacy = major <= 8;
      if (expectLegacy !== ctx.isLegacy) {
        return fail(
          `Org version ${version} implies ${expectLegacy ? "V8" : "modern"}, ` +
            `but the adapter reports ${detected} (isLegacy=${ctx.isLegacy}).`
        );
      }
    }
    return pass(`Detected ${detected} adapter for org version ${version} (isLegacy=${ctx.isLegacy}).`);
  },
};

const globalContext: ITestCase = {
  id: "t1-global-context",
  title: "Global context and settings reads",
  tier: 1,
  section: "Context",
  channel: "host-surface",
  run(ctx, _scratch, ops) {
    const gc = ctx.globalContext;
    ops.note("read globalContext.getVersion() + organizationSettings + userSettings");
    const version = gc.getVersion();
    const org = gc.organizationSettings;
    const user = gc.userSettings;
    if (!version) {
      return fail("globalContext.getVersion() returned nothing.");
    }
    if (!user.userId) {
      return fail("globalContext.userSettings.userId is empty.");
    }
    const bits = [
      `version=${version}`,
      `org=${org.uniqueName || "(none)"}`,
      `orgId=${org.organizationId || "(none)"}`,
      `user=${user.userName || "(none)"}`,
      `lang=${user.languageId ?? "(none)"}`,
      `tzOffset=${user.getTimeZoneOffsetMinutes()}`,
    ];
    return pass(bits.join(", "));
  },
};

const formatting: ITestCase = {
  id: "t1-formatting",
  title: "User locale formatting",
  tier: 1,
  section: "Context",
  channel: "host-surface",
  async run(ctx, _scratch, ops) {
    ops.note("getFormatting() (date format info + usersettings decimal/group/currencyFormatCode/timeFormat)");
    const f = await ctx.getFormatting();
    // 8.x does not reliably expose date-format names; absence is acceptable there.
    const parts = [
      `decimal=${f.decimalSymbol ?? "?"}`,
      `group=${f.numberSeparator ?? "?"}`,
      `time=${f.timeFormat ?? "?"}`,
      `dateNames=${f.dateFormatInfo ? "present" : "absent"}`,
    ];
    return pass(parts.join(", "));
  },
};

//#endregion

//#region Data reads

const webApiAccount: ITestCase = {
  id: "t1-webapi-account",
  title: "Web API retrieveMultiple: account",
  tier: 1,
  section: "Data reads",
  async run(ctx, scratch, ops) {
    const query = "?$select=accountid,name&$top=1";
    ops.query(readVia(ctx), "account", query);
    const result = await ctx.webAPI.retrieveMultipleRecords("account", query);
    const rows = result.entities ?? [];
    if (rows.length === 0) {
      return pass("0 rows (empty org or no read access); the adapter query path still ran.");
    }
    const first = rows[0];
    const id = first["accountid"];
    if (typeof id === "string") {
      scratch.accountId = id;
    }
    if (typeof first["name"] === "string") {
      scratch.accountName = first["name"];
    }
    return pass(`${rows.length} row(s); first name=${JSON.stringify(first["name"] ?? null)}.`);
  },
};

const webApiContact: ITestCase = {
  id: "t1-webapi-contact",
  title: "Web API retrieveMultiple: contact",
  tier: 1,
  section: "Data reads",
  async run(ctx, _scratch, ops) {
    const query = "?$select=contactid,fullname&$top=1";
    ops.query(readVia(ctx), "contact", query);
    const result = await ctx.webAPI.retrieveMultipleRecords("contact", query);
    const rows = result.entities ?? [];
    return rows.length === 0
      ? pass("0 rows (empty org or no read access); the adapter query path still ran.")
      : pass(`${rows.length} row(s); first fullname=${JSON.stringify(rows[0]["fullname"] ?? null)}.`);
  },
};

const retrieveRecord: ITestCase = {
  id: "t1-retrieve-record",
  title: "Web API retrieveRecord roundtrip",
  tier: 1,
  section: "Data reads",
  async run(ctx, scratch, ops) {
    const id = scratch.accountId;
    if (typeof id !== "string") {
      return skip("No account id from the earlier query (empty org); nothing to retrieve.");
    }
    const query = "?$select=accountid,name";
    ops.query(readVia(ctx), `account(${id})`, query);
    const record = await ctx.webAPI.retrieveRecord("account", id, query);
    if (!asRecord(record)) {
      return fail("retrieveRecord did not return a record object.");
    }
    return pass(`Retrieved account ${id}; name=${JSON.stringify(asRecord(record)?.name ?? null)}.`);
  },
};

const workingQuery: ITestCase = {
  id: "t1-working-query",
  title: "Working-case filter: $filter eq, startswith, contains",
  tier: 1,
  section: "Data reads",
  async run(ctx, scratch, ops) {
    const name = scratch.accountName;
    if (typeof name !== "string" || !name) {
      return skip("No account name from the earlier query (empty org); nothing to filter for.");
    }
    const via = readVia(ctx);
    const eqQuery = `?$select=accountid,name&$filter=name eq '${LibraryUtils.escapeODataString(name)}'&$top=1`;
    ops.query(via, "account", eqQuery);
    const eqRows = (await ctx.webAPI.retrieveMultipleRecords("account", eqQuery)).entities ?? [];

    const head = name.slice(0, 1);
    const swQuery = `?$select=name&$filter=startswith(name,'${LibraryUtils.escapeODataString(head)}')&$top=1`;
    ops.query(via, "account", swQuery);
    const swRows = (await ctx.webAPI.retrieveMultipleRecords("account", swQuery)).entities ?? [];

    const chunk = name.slice(0, Math.min(3, name.length));
    const cQuery = `?$select=name&$filter=contains(name,'${LibraryUtils.escapeODataString(chunk)}')&$top=1`;
    ops.query(via, "account", cQuery);
    const cRows = (await ctx.webAPI.retrieveMultipleRecords("account", cQuery)).entities ?? [];

    ops.note(`eq matched ${eqRows.length}, startswith matched ${swRows.length}, contains matched ${cRows.length}`);
    if (eqRows.length === 0) {
      return fail(`$filter=name eq '<known name>' returned 0 rows; the exact-match query path is broken.`);
    }
    return pass(
      `eq matched the known account (${eqRows.length} row); startswith and contains also ran ` +
        `(${swRows.length}/${cRows.length} rows).`
    );
  },
};

const formattedValues: ITestCase = {
  id: "t1-formatted-values",
  title: "Formatted values + lookuplogicalname through the adapter",
  tier: 1,
  section: "Data reads",
  async run(ctx, _scratch, ops) {
    const query = "?$select=name,industrycode,revenue,createdon,_primarycontactid_value&$top=1";
    ops.query(readVia(ctx), "account", query);
    const rows = (await ctx.webAPI.retrieveMultipleRecords("account", query)).entities ?? [];
    if (rows.length === 0) {
      return skip("0 account rows (empty org); no annotations to read.");
    }
    const row = rows[0];
    const valued: string[] = [];
    const withFormatted: string[] = [];
    for (const col of ["industrycode", "revenue", "createdon"]) {
      if (row[col] !== undefined && row[col] !== null) {
        valued.push(col);
        if (typeof row[`${col}${FORMATTED_VALUE}`] === "string") {
          withFormatted.push(col);
        }
      }
    }
    ops.note(`valued columns: ${valued.join(", ") || "(none)"}; with FormattedValue: ${withFormatted.join(", ") || "(none)"}`);

    let lookupNote = "_primarycontactid_value: empty";
    const lookupVal = row["_primarycontactid_value"];
    if (lookupVal) {
      const lln = row[`_primarycontactid_value${LOOKUP_LOGICAL_NAME}`];
      ops.note(`_primarycontactid_value lookuplogicalname = ${JSON.stringify(lln ?? null)}`);
      if (typeof lln !== "string" || !lln) {
        return fail("_primarycontactid_value is populated but its lookuplogicalname annotation is missing.");
      }
      lookupNote = `_primarycontactid_value -> ${lln}`;
    }

    if (valued.length === 0) {
      return skip(`the account carries no industrycode/revenue/createdon value; ${lookupNote}.`);
    }
    if (withFormatted.length === 0) {
      return fail(`valued columns (${valued.join(", ")}) returned no FormattedValue annotation.`);
    }
    return pass(`FormattedValue on ${withFormatted.join(", ")}; ${lookupNote}.`);
  },
};

const savedQueryOption: ITestCase = {
  id: "t1-savedquery",
  title: "savedQuery predefined-query option",
  tier: 1,
  section: "Data reads",
  async run(ctx, _scratch, ops) {
    const via = readVia(ctx);
    const filter = `returnedtypecode eq 'account' and querytype eq 0 and isdefault eq true and statecode eq 0`;
    const viewQuery = `?$select=savedqueryid,name&$filter=${encodeURIComponent(filter)}&$top=1`;
    ops.query(via, "savedquery", viewQuery);
    const views = (await ctx.webAPI.retrieveMultipleRecords("savedquery", viewQuery)).entities ?? [];
    if (views.length === 0) {
      return skip("No default account grid view found (empty/locked org); savedQuery option not exercised.");
    }
    const id = String(views[0].savedqueryid ?? "");
    const q = `?savedQuery=${id}`;
    ops.query(via, "account", q);
    const rows = (await ctx.webAPI.retrieveMultipleRecords("account", q)).entities ?? [];
    return pass(`savedQuery=${id} ("${views[0].name ?? "?"}") resolved ${rows.length} row(s); a clean empty result is a pass too.`);
  },
};

const userSettingsRead: ITestCase = {
  id: "t1-usersettings",
  title: "usersettingscollection read (user separators)",
  tier: 1,
  section: "Data reads",
  // Builds its own cds-client at the host version, not the ctx surface the pin
  // reroutes, so it skips in pinned mode rather than run silently unpinned.
  channel: "version-explicit",
  async run(ctx, _scratch, ops) {
    if (!sameOriginAsHost(ctx)) {
      return skip("usersettings read runs only against the hosting org (same-origin); not this host.");
    }
    const query =
      `?$select=decimalsymbol,numberseparator,currencyformatcode,timeformatstring` +
      `&$filter=systemuserid eq ${normalizeGuid(ctx.user.id)}`;
    ops.query("cds-client (the kit reads usersettings directly)", "usersettingscollection", query);
    try {
      const result = await kitClient(ctx).retrieveMultiple("usersettingscollection", query);
      const row = result.entities[0];
      if (!row) {
        return skip("usersettingscollection returned no row for the current user.");
      }
      ops.note(
        `decimalsymbol=${JSON.stringify(row.decimalsymbol ?? null)}, ` +
          `numberseparator=${JSON.stringify(row.numberseparator ?? null)}, ` +
          `currencyformatcode=${JSON.stringify(row.currencyformatcode ?? null)}, ` +
          `timeformatstring=${JSON.stringify(row.timeformatstring ?? null)}`
      );
      return pass(
        `usersettings read: decimal=${row.decimalsymbol ?? "?"}, group=${row.numberseparator ?? "?"}, ` +
          `currencyFormatCode=${row.currencyformatcode ?? "?"}.`
      );
    } catch (error) {
      return fail(`usersettingscollection read failed: ${errText(error)}`);
    }
  },
};

//#endregion

//#region FetchXML channel

const fetchXmlQuery: ITestCase = {
  id: "t1-fetchxml",
  title: "FetchXML escape smoke (escaped literal survives the query)",
  tier: 1,
  section: "FetchXML channel",
  async run(ctx, _scratch, ops) {
    // A probe value with the five XML-sensitive characters, escaped through the
    // one sanctioned escaper. The point here is only that a broken escape would
    // make the fetch fail rather than resolve; the POSITIVE round-trip (the
    // escaped name matching exactly one created row) is the tier-2 test.
    const probe = "Test & Co <\"'>";
    const esc = LibraryUtils.escapeXml;
    const fetchXml = `
      <fetch top='1'>
        <entity name='account'>
          <attribute name='name' />
          <filter>
            <condition attribute='name' operator='like' value='%${esc(probe)}%' />
          </filter>
        </entity>
      </fetch>`;
    ops.fetchXml(FETCH_VIA, "account", fetchXml);
    const result = await ctx.webAPI.fetch("account", fetchXml);
    return pass(
      `FetchXML with an escaped XML-sensitive literal resolved (${(result.entities ?? []).length} row(s)); ` +
        `the query survived the channel (positive match is verified in tier 2).`
    );
  },
};

const formattedValuesFetch: ITestCase = {
  id: "t1-formatted-values-fetch",
  title: "FormattedValue annotations through the kit XHR client",
  tier: 1,
  section: "FetchXML channel",
  async run(ctx, _scratch, ops) {
    const fetchXml = `
      <fetch top='1'>
        <entity name='account'>
          <attribute name='name' />
          <attribute name='industrycode' />
          <attribute name='createdon' />
        </entity>
      </fetch>`;
    ops.fetchXml(FETCH_VIA, "account", fetchXml);
    const rows = (await ctx.webAPI.fetch("account", fetchXml)).entities ?? [];
    if (rows.length === 0) {
      return skip("0 account rows (empty org); the Prefer-annotations header still went out on the channel.");
    }
    const keys = Object.keys(rows[0]).filter((k) => k.endsWith(FORMATTED_VALUE));
    ops.note(`FormattedValue keys: ${keys.join(", ") || "(none)"}`);
    if (keys.length === 0) {
      return fail(
        "No FormattedValue annotation on the FetchXML result: the Prefer include-annotations header is not configured on this channel."
      );
    }
    return pass(`${keys.length} FormattedValue annotation(s) survived the FetchXML channel: ${keys.join(", ")}.`);
  },
};

const fetchPaging: ITestCase = {
  id: "t1-fetch-paging",
  title: "FetchXML paging contract (totalrecordcount / morerecords / cookie)",
  tier: 1,
  section: "FetchXML channel",
  async run(ctx, _scratch, ops) {
    const fetchXml = `
      <fetch page='1' count='1' returntotalrecordcount='true'>
        <entity name='account'>
          <attribute name='name' />
        </entity>
      </fetch>`;
    ops.fetchXml(FETCH_VIA, "account", fetchXml);
    const result = await ctx.webAPI.fetch("account", fetchXml);
    const rows = result.entities ?? [];
    ops.note(
      `totalRecordCount=${result.totalRecordCount ?? "(absent)"}, ` +
        `moreRecords=${result.moreRecords ?? "(absent)"}, ` +
        `pagingCookie=${result.pagingCookie ? "present" : "absent"}`
    );
    if (result.totalRecordCount === undefined) {
      return rows.length === 0
        ? skip("No totalrecordcount annotation and 0 rows (empty org or non-live host); paging contract not confirmable.")
        : fail("Rows returned but the totalrecordcount annotation is missing: the paging contract is broken on this channel.");
    }
    return pass(
      `Paging annotations arrived: totalRecordCount=${result.totalRecordCount}, ` +
        `moreRecords=${result.moreRecords ?? false}, pagingCookie ${result.pagingCookie ? "present" : "absent"}.`
    );
  },
};

const linkEntityAlias: ITestCase = {
  id: "t1-link-alias",
  title: "Link-entity aliased column key shape",
  tier: 1,
  section: "FetchXML channel",
  async run(ctx, _scratch, ops) {
    const fetchXml = `
      <fetch top='1'>
        <entity name='account'>
          <attribute name='name' />
          <link-entity name='contact' from='contactid' to='primarycontactid' alias='pc'>
            <attribute name='contactid' />
          </link-entity>
        </entity>
      </fetch>`;
    ops.fetchXml(FETCH_VIA, "account", fetchXml);
    const rows = (await ctx.webAPI.fetch("account", fetchXml)).entities ?? [];
    if (rows.length === 0) {
      return skip("No account with a primary contact (inner join returned 0 rows); alias key shape not observable here.");
    }
    const kitKeys = Object.keys(rows[0]).filter((k) => k.toLowerCase().startsWith("pc"));
    ops.note(`kit-channel aliased key(s): ${kitKeys.map((k) => JSON.stringify(k)).join(", ") || "(none)"}`);
    if (kitKeys.length === 0) {
      return skip("The joined row carried no aliased column; alias key shape not observable here.");
    }
    // ASSERTED: the kit channel must deliver the modern dotted shape. The client
    // normalizes any v8 x002e/x0040 encoding at parseCollection, so an encoded
    // key reaching the consumer means that normalization has regressed.
    const leaked = kitKeys.filter(isEncodedKey);
    if (leaked.length > 0) {
      return fail(
        `The kit channel delivered encoded alias key(s) ${leaked.join(", ")}; the client must ` +
          `normalize these to the modern dotted shape.`
      );
    }
    if (!kitKeys.some((k) => k.startsWith("pc."))) {
      return fail(
        `The kit channel alias key(s) ${kitKeys.join(", ")} are neither dotted nor a known encoding.`
      );
    }
    // REPORTED: the platform's wire shape, measured by a raw fetch alongside, so
    // the diagnostic still shows what the engine sent even though the kit dotted it.
    const wire = await rawAliasWireShape(ctx, fetchXml, ops);
    return pass(
      `Kit channel alias keys are the modern dotted shape (${kitKeys.join(", ")}); platform wire shape: ${wire}. ` +
        `The kit normalizes encoded keys to the modern shape at the client.`
    );
  },
};

const batchFallback: ITestCase = {
  id: "t1-batch",
  title: "$batch long-URL GET fallback",
  tier: 1,
  section: "FetchXML channel",
  async run(ctx, _scratch, ops) {
    // A FetchXML whose encoded GET URL exceeds CdsClient's 2048-char threshold,
    // so the kit routes it through a multipart $batch POST. Read-only.
    const THRESHOLD = 2048;
    const dummyIds = Array.from(
      { length: 80 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`
    );
    const values = dummyIds.map((id) => `            <value>${LibraryUtils.escapeXml(id)}</value>`).join("\n");
    const fetchXml = `
      <fetch top='1'>
        <entity name='account'>
          <attribute name='accountid' />
          <filter>
            <condition attribute='accountid' operator='in'>
${values}
            </condition>
          </filter>
        </entity>
      </fetch>`;
    const encodedLen = `?fetchXml=${encodeURIComponent(fetchXml)}`.length;
    ops.fetchXml(FETCH_VIA, "account", fetchXml);
    ops.note(
      `encoded query length = ${encodedLen} chars (CdsClient.maxUrlLength = ${THRESHOLD}); ` +
        `${encodedLen > THRESHOLD ? "over threshold -> $batch POST fallback" : "under threshold"}`
    );
    if (encodedLen <= THRESHOLD) {
      return fail(`Probe misconfigured: encoded length ${encodedLen} did not exceed ${THRESHOLD}.`);
    }
    const rows = (await ctx.webAPI.fetch("account", fetchXml)).entities ?? [];
    return pass(
      `Long-URL FetchXML (${encodedLen} chars) resolved ${rows.length} row(s); on a live host the kit sends it as a multipart $batch GET.`
    );
  },
};

//#endregion

//#region Metadata

/** Attributes both the native metadata test and the v8.2-synthesis lab resolve. */
const METADATA_ATTRIBUTES = ["name", "industrycode", "createdon", "primarycontactid"];

/**
 * The standard-shape assertions run against an account metadata object: entity
 * fields as strings, an Attributes ItemCollection, industrycode as an option
 * set. Shared so the native store test and the v8.2 synthesis lab check the
 * exact same shape. Returns the problems found (empty = clean) plus a detail.
 */
function checkAccountMetadataShape(meta: IEntityMetadata): { problems: string[]; detail: string } {
  const problems: string[] = [];
  if (meta.LogicalName !== "account") {
    problems.push(`LogicalName=${JSON.stringify(meta.LogicalName)} (expected "account")`);
  }
  if (!meta.EntitySetName) {
    problems.push("EntitySetName missing");
  }
  if (!meta.PrimaryIdAttribute) {
    problems.push("PrimaryIdAttribute missing");
  }
  if (!meta.PrimaryNameAttribute) {
    problems.push("PrimaryNameAttribute missing");
  }
  const collection = asRecord(meta.Attributes);
  if (!collection || typeof collection.get !== "function") {
    problems.push("Attributes ItemCollection (get) missing");
  }
  let kindNote = "industrycode: not resolved";
  const industry = findAttributeMetadata(meta, "industrycode");
  if (industry) {
    const kind = attributeKind(industry);
    kindNote = `industrycode kind=${kind}`;
    if (kind !== "optionset") {
      problems.push(`industrycode classified ${kind} (expected optionset)`);
    }
  } else {
    problems.push("industrycode attribute metadata not resolved");
  }
  const detail =
    `EntitySetName=${meta.EntitySetName}, PrimaryId=${meta.PrimaryIdAttribute}, ` +
    `PrimaryName=${meta.PrimaryNameAttribute}, ${kindNote}`;
  return { problems, detail };
}

const entityMetadata: ITestCase = {
  id: "t1-entity-metadata",
  title: "Entity metadata shape (getEntityMetadata)",
  tier: 1,
  section: "Metadata",
  async run(ctx, _scratch, ops) {
    ops.note(`utils.getEntityMetadata("account", [${METADATA_ATTRIBUTES.join(", ")}]) via ${ctx.isLegacy ? "OData synthesis" : "native store (OData fallback)"}`);
    const meta = await ctx.utils.getEntityMetadata("account", METADATA_ATTRIBUTES);
    const { problems, detail } = checkAccountMetadataShape(meta);
    const path = ctx.isLegacy ? "OData synthesis path" : "native store";
    const full = `${detail} (${path}).`;
    return problems.length ? fail(`${problems.join("; ")}. ${full}`) : pass(full);
  },
};

const savedView: ITestCase = {
  id: "t1-view",
  title: "Saved view resolution (account default grid)",
  tier: 1,
  section: "Metadata",
  async run(ctx, _scratch, ops) {
    // The source shapes its own $select per API version (a v8 line has no
    // savedquery.layoutjson), so report the layout the view actually carries
    // rather than naming columns this test did not choose.
    ops.note('metadata.getView("account") -> default grid savedquery read');
    const view = await ctx.metadata.getView("account");
    if (!view.fetchXml) {
      return fail("View resolved without fetchXml.");
    }
    const layoutSource = view.layoutJson ? "layoutjson" : "layoutxml (the v8 fallback)";
    ops.note(`layout source: ${layoutSource}; columns=${view.columns.length}`);
    return pass(
      `View "${view.name}" id=${view.id}; ${view.columns.length} column(s) from ${layoutSource}.`
    );
  },
};

const currencySymbol: ITestCase = {
  id: "t1-currency",
  title: "Currency symbol + org pricing precision",
  tier: 1,
  section: "Metadata",
  async run(ctx, _scratch, ops) {
    const settings = ctx.globalContext;
    const currencyId =
      settings.userSettings.transactionCurrency?.id ??
      settings.organizationSettings.baseCurrency?.id ??
      settings.organizationSettings.baseCurrencyId;
    if (!currencyId) {
      return skip("No transaction/base currency id exposed by the host; currency read skipped.");
    }
    ops.note(`metadata.getCurrencySymbol(${currencyId}) -> transactioncurrency read; getPricingDecimalPrecision -> organization read`);
    const info = await ctx.metadata.getCurrencySymbol(currencyId);
    const precision = await ctx.metadata.getPricingDecimalPrecision();
    return pass(
      `Currency ${currencyId}: symbol=${info.symbol}, precision=${info.precision ?? "(default)"}; ` +
        `org pricing precision=${precision ?? "(none)"}.`
    );
  },
};

const metadataCast: ITestCase = {
  id: "t1-metadata-cast",
  title: "Metadata Picklist cast (EntityDefinitions / Attributes / $expand)",
  tier: 1,
  section: "Metadata",
  // A raw same-origin probe over its own cds-client, not the pinned surface.
  channel: "version-explicit",
  async run(ctx, _scratch, ops) {
    if (!sameOriginAsHost(ctx)) {
      return skip("Direct metadata cast runs only against the hosting org (same-origin); not this host.");
    }
    const path =
      `EntityDefinitions(LogicalName='account')/Attributes(LogicalName='industrycode')` +
      `/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet,GlobalOptionSet`;
    ops.http("GET", `${apiBase(ctx)}${path}`, { Accept: "application/json" });
    const role = ctx.isLegacy
      ? "the V8 metadata synthesis spine"
      : "an informational direct probe (the native store is the kit's real path on modern)";
    try {
      const raw = await kitClient(ctx).get(path);
      const optionSet = asRecord(raw.OptionSet) ?? asRecord(raw.GlobalOptionSet);
      const options = (optionSet?.Options as Array<Record<string, unknown>> | undefined) ?? [];
      const firstLabel = asRecord(asRecord(options[0])?.Label);
      const userLabel = asRecord(firstLabel?.UserLocalizedLabel)?.Label;
      ops.note(`${options.length} option(s); first UserLocalizedLabel.Label = ${JSON.stringify(userLabel ?? null)}`);
      if (options.length > 0 && typeof userLabel !== "string") {
        return fail(`The Picklist cast returned options but no UserLocalizedLabel.Label shape resolved (${role}).`);
      }
      return pass(
        `Picklist cast resolved ${options.length} option(s); UserLocalizedLabel shape ` +
          `${typeof userLabel === "string" ? "present" : "n/a (no options)"} (${role}).`
      );
    } catch (error) {
      return fail(`Metadata cast GET failed: ${errText(error)} (${role}).`);
    }
  },
};

//#endregion

//#region Capability probes

const whoAmI: ITestCase = {
  id: "t1-whoami",
  title: "Unbound function: WhoAmI",
  tier: 1,
  section: "Capability probes",
  async run(ctx, _scratch, ops) {
    const request: IWebApiRequest = {
      getMetadata: () => ({ operationName: "WhoAmI", operationType: 1 }),
    };
    ops.note("execute WhoAmI (unbound function; GET .../WhoAmI() on cds-client, native online.execute on modern)");
    const response = await ctx.webAPI.execute(request);
    if (!response.ok) {
      return fail(`WhoAmI returned HTTP ${response.status}.`);
    }
    const body = asRecord(await response.json());
    if (!body || !body.UserId) {
      return skip(`execute resolved ok but returned no WhoAmI body (non-live host); status ${response.status}.`);
    }
    ops.note(`UserId=${body.UserId}, OrganizationId=${body.OrganizationId ?? "?"}`);
    return pass(`WhoAmI resolved: UserId=${body.UserId}.`);
  },
};

const hostDegradation: ITestCase = {
  id: "t1-modern-only-member",
  title: "Host degradation: app properties on 8.x",
  tier: 1,
  section: "Capability probes",
  channel: "host-surface",
  async run(ctx, _scratch, ops) {
    // Modern hosts expose business-app properties; this is a V8-only probe that
    // the host rejects loudly instead of answering wrong.
    if (!ctx.isLegacy) {
      return skip("n/a on the modern host (app properties are supported there).");
    }
    ops.note("globalContext.getCurrentAppProperties() (expected to reject on the CRM 8.x host)");
    try {
      await ctx.globalContext.getCurrentAppProperties();
      return fail("Expected getCurrentAppProperties to reject on the CRM 8.x host, but it resolved.");
    } catch (error) {
      return pass(`Rejected as designed: ${errText(error)}`);
    }
  },
};

const versionPath: ITestCase = {
  id: "t1-version-path",
  title: "Informational: /api/data/v9.0/ path (8.x vs 9.x)",
  tier: 1,
  section: "Capability probes",
  channel: "version-explicit",
  async run(ctx, _scratch, ops) {
    if (!sameOriginAsHost(ctx) || typeof fetch !== "function") {
      return skip("Platform version probe runs only against the hosting org (same-origin).");
    }
    const url = `${ctx.clientUrl.replace(/\/+$/, "")}/api/data/v9.0/`;
    ops.http("GET", url, { Accept: "application/json" });
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      ops.note(`status ${response.status}`);
      const classifier = response.ok ? "9.x (v9.0 path served)" : `pre-9.x (v9.0 path returned ${response.status})`;
      return pass(`/api/data/v9.0/ -> HTTP ${response.status}: classifies this org as ${classifier}. Informational (the kit does not depend on this path).`);
    } catch (error) {
      return skip(`Platform probe could not run: ${errText(error)}.`);
    }
  },
};

const applyAggregate: ITestCase = {
  id: "t1-apply-aggregate",
  title: "Informational: $apply aggregation",
  tier: 1,
  section: "Capability probes",
  channel: "version-explicit",
  async run(ctx, _scratch, ops) {
    if (!sameOriginAsHost(ctx) || typeof fetch !== "function") {
      return skip("$apply probe runs only against the hosting org (same-origin).");
    }
    const url = `${apiBase(ctx)}accounts?$apply=aggregate($count as c)`;
    ops.http("GET", url, { Accept: "application/json" });
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      ops.note(`status ${response.status}`);
      return pass(
        `$apply=aggregate -> HTTP ${response.status}: ${response.ok ? "supported (9.x)" : "not available (400/501 expected on 8.2)"}. ` +
          `Informational; absence is a pass for this probe.`
      );
    } catch (error) {
      return skip(`Platform probe could not run: ${errText(error)}.`);
    }
  },
};

const expandDeferral: ITestCase = {
  id: "t1-expand-deferral",
  title: "Informational: collection-valued $expand (inline vs nextLink)",
  tier: 1,
  section: "Capability probes",
  channel: "version-explicit",
  async run(ctx, _scratch, ops) {
    if (!sameOriginAsHost(ctx) || typeof fetch !== "function") {
      return skip("$expand probe runs only against the hosting org (same-origin).");
    }
    const url = `${apiBase(ctx)}accounts?$select=name&$top=1&$expand=contact_customer_accounts($select=fullname)`;
    ops.http("GET", url, { Accept: "application/json" });
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      ops.note(`status ${response.status}`);
      if (!response.ok) {
        return pass(`Collection $expand -> HTTP ${response.status}; not evaluated further. Informational.`);
      }
      const body = asRecord(await response.json());
      const rows = (body?.value as Array<Record<string, unknown>> | undefined) ?? [];
      if (rows.length === 0) {
        return skip("No account rows to inspect the expand shape.");
      }
      const row = rows[0];
      const inline = Array.isArray(row["contact_customer_accounts"]);
      const deferred = typeof row["contact_customer_accounts@odata.nextLink"] === "string";
      const shape = inline ? "inline rows" : deferred ? "@odata.nextLink deferral" : "absent/empty";
      ops.note(`contact_customer_accounts shape: ${shape}`);
      return pass(`Collection-valued $expand returns ${shape}. Informational (the kit pages FetchXML instead).`);
    } catch (error) {
      return skip(`Platform probe could not run: ${errText(error)}.`);
    }
  },
};

const countProbe: ITestCase = {
  id: "t1-count",
  title: "Informational: $count=true",
  tier: 1,
  section: "Capability probes",
  channel: "version-explicit",
  async run(ctx, _scratch, ops) {
    if (!sameOriginAsHost(ctx) || typeof fetch !== "function") {
      return skip("$count probe runs only against the hosting org (same-origin).");
    }
    const url = `${apiBase(ctx)}accounts?$count=true&$top=1`;
    ops.http("GET", url, { Accept: "application/json" });
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const body = asRecord(await response.json());
      const count = body?.["@odata.count"];
      ops.note(`@odata.count = ${JSON.stringify(count ?? null)} (status ${response.status})`);
      return pass(
        `$count=true -> @odata.count ${typeof count === "number" ? `= ${count}` : "absent"} (HTTP ${response.status}). ` +
          `Informational; the kit takes totals from FetchXML returntotalrecordcount, not $count.`
      );
    } catch (error) {
      return skip(`Platform probe could not run: ${errText(error)}.`);
    }
  },
};

//#endregion

//#region API version lab

/**
 * The common skip gate for the v8.2 battery: the raw endpoint probes need the
 * hosting org (same-origin, ambient credentials) and the /api/data/v8.2/ path
 * must be served (from the sweep's scratch hand-off). Off a real 8.x org only
 * the v8.x paths serve, so the battery degrades naturally.
 */
function labV82Gate(ctx: IViewModelContext, scratch: Scratch): ITestOutcome | undefined {
  if (!sameOriginAsHost(ctx) || typeof fetch !== "function") {
    return skip("v8.2-endpoint battery runs only against the hosting org (same-origin); not this host.");
  }
  const served = scratch[LAB_SERVED_KEY];
  if (!Array.isArray(served)) {
    return skip("The version sweep did not run (same-origin only), so v8.2 availability is unknown.");
  }
  if (!served.includes("8.2")) {
    return skip("The /api/data/v8.2/ path is not served on this org; the v8.2-endpoint battery does not apply.");
  }
  return undefined;
}

const labVersionSweep: ITestCase = {
  id: LAB_SWEEP_ID,
  title: "API version sweep: which /api/data/vX.Y/ paths serve",
  tier: 1,
  section: LAB_SECTION,
  channel: "version-explicit",
  async run(ctx, scratch, ops) {
    if (!sameOriginAsHost(ctx) || typeof fetch !== "function") {
      return skip("API version sweep runs only against the hosting org (same-origin); not this host.");
    }
    const base = ctx.clientUrl.replace(/\/+$/, "");
    const served: string[] = [];
    const line: string[] = [];
    for (const version of LAB_VERSIONS) {
      const url = `${base}/api/data/v${version}/`;
      ops.http("GET", url, { Accept: "application/json" });
      try {
        const response = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          served.push(version);
        }
        ops.note(`v${version} -> HTTP ${response.status}${response.ok ? " (served)" : ""}`);
        line.push(`v${version}=${response.status}`);
      } catch (error) {
        // A network error is a report line, never a failure: the sweep reports
        // the org's version surface, it does not assert one.
        ops.note(`v${version} -> probe error ${errText(error)}`);
        line.push(`v${version}=error`);
      }
    }
    // Hand the served list to the v8.2 battery below.
    scratch[LAB_SERVED_KEY] = served;
    const servedText = served.length ? served.map((v) => `v${v}`).join(", ") : "(none)";
    return pass(
      `API version paths on this org: served ${servedText}; full sweep ${line.join(", ")}. ` +
        `Every path answers on the same modern engine, so this measures the version CONTRACT, not an old server.`
    );
  },
};

const labV82FetchXml: ITestCase = {
  id: LAB_FETCHXML_ID,
  title: "v8.2 endpoint: FetchXML annotations, paging, alias key shape",
  tier: 1,
  section: LAB_SECTION,
  channel: "version-explicit",
  async run(ctx, scratch, ops) {
    const gate = labV82Gate(ctx, scratch);
    if (gate) {
      return gate;
    }
    const client = kitClient(ctx, "8.2");
    // A small fetch through the v8.2 path: a link-entity alias (an inner join,
    // so a matched row carries the aliased key) plus returntotalrecordcount for
    // the paging annotations, and createdon for a FormattedValue where valued.
    const fetchXml = `
      <fetch page='1' count='1' returntotalrecordcount='true'>
        <entity name='account'>
          <attribute name='name' />
          <attribute name='createdon' />
          <link-entity name='contact' from='contactid' to='primarycontactid' alias='pc'>
            <attribute name='contactid' />
          </link-entity>
        </entity>
      </fetch>`;
    // CdsClient.fetch takes the entity SET name (the adapters resolve it the
    // same way); passing the logical name 404s with "segment 'account'".
    const entitySet = LibraryUtils.entitySetName("account");
    ops.fetchXml("cds-client @ apiVersion 8.2", entitySet, fetchXml);
    const result = await client.fetch(entitySet, fetchXml);
    const rows = result.entities ?? [];

    // Paging: the core assertion. returntotalrecordcount must round-trip.
    if (result.totalRecordCount === undefined) {
      return rows.length === 0
        ? skip(`${LAB_V82_PREFIX}no totalrecordcount and 0 joined rows; paging contract not confirmable here.`)
        : fail(`${LAB_V82_PREFIX}rows returned but the totalrecordcount annotation is missing on the v8.2 path.`);
    }
    ops.note(
      `totalRecordCount=${result.totalRecordCount}, moreRecords=${result.moreRecords ?? false}, ` +
        `pagingCookie=${result.pagingCookie ? "present" : "absent"}`
    );

    if (rows.length === 0) {
      return pass(
        `${LAB_V82_PREFIX}paging annotations arrived (totalRecordCount=${result.totalRecordCount}); ` +
          `no account has a primary contact, so FormattedValue and the alias key shape are not observable here.`
      );
    }

    const row = rows[0];
    // FormattedValue where applicable: createdon is valued, so its annotation
    // must arrive; absence is a broken annotation channel on this path.
    const createdonValued = row["createdon"] !== undefined && row["createdon"] !== null;
    const createdonFormatted = typeof row[`createdon${FORMATTED_VALUE}`] === "string";
    if (createdonValued && !createdonFormatted) {
      return fail(
        `${LAB_V82_PREFIX}createdon is valued but carries no FormattedValue annotation on the v8.2 path.`
      );
    }

    // Alias key shape: the kit channel (client.fetch over the v8.2 path) is
    // ASSERTED to deliver the modern dotted shape, because parseCollection
    // normalizes any v8 x002e/x0040 encoding at the client; a raw fetch reports
    // the platform's wire shape verbatim alongside.
    const kitKeys = Object.keys(row).filter((k) => k.toLowerCase().startsWith("pc"));
    ops.note(`kit-channel aliased key(s): ${kitKeys.map((k) => JSON.stringify(k)).join(", ") || "(none)"}`);
    const leaked = kitKeys.filter(isEncodedKey);
    if (leaked.length > 0) {
      return fail(
        `${LAB_V82_PREFIX}the kit channel delivered encoded alias key(s) ${leaked.join(", ")} on the v8.2 path; ` +
          `the client must normalize these to the modern dotted shape.`
      );
    }
    const wire = await rawAliasWireShape(ctx, fetchXml, ops, "8.2");
    return pass(
      `${LAB_V82_PREFIX}paging annotations arrived (totalRecordCount=${result.totalRecordCount}); ` +
        `FormattedValue on createdon ${createdonFormatted ? "present" : "n/a (createdon empty)"}; ` +
        `kit channel alias keys = modern dotted (${kitKeys.join(", ") || "(none)"}); platform wire shape: ${wire}. ` +
        `The kit normalizes encoded keys to the dotted shape at the client.`
    );
  },
};

const labV82Metadata: ITestCase = {
  id: LAB_METADATA_ID,
  title: "v8.2 endpoint: metadata synthesis spine (CdsEntityMetadataProvider)",
  tier: 1,
  section: LAB_SECTION,
  channel: "version-explicit",
  async run(ctx, scratch, ops) {
    const gate = labV82Gate(ctx, scratch);
    if (gate) {
      return gate;
    }
    // Drive the kit's REAL synthesis code over an apiVersion-8.2 client: the
    // provider's only dependency is a CdsClient, so it constructs standalone.
    // This is the v8 metadata spine executing live against the v8.2 contract.
    const provider = new CdsEntityMetadataProvider(kitClient(ctx, "8.2"));
    ops.note(
      `CdsEntityMetadataProvider(apiVersion 8.2).getEntityMetadata("account", ` +
        `[${METADATA_ATTRIBUTES.join(", ")}]) -> EntityDefinitions, Attributes, Picklist cast ($expand OptionSet,GlobalOptionSet)`
    );
    const meta = await provider.getEntityMetadata("account", METADATA_ATTRIBUTES);
    const { problems, detail } = checkAccountMetadataShape(meta);
    const full = `${LAB_V82_PREFIX}${detail} (real synthesis spine over the v8.2 endpoint).`;
    return problems.length ? fail(`${problems.join("; ")}. ${full}`) : pass(full);
  },
};

const labV82Classifiers: ITestCase = {
  id: LAB_CLASSIFIERS_ID,
  title: "v8.2 endpoint: $apply and collection $expand classifiers",
  tier: 1,
  section: LAB_SECTION,
  channel: "version-explicit",
  async run(ctx, scratch, ops) {
    const gate = labV82Gate(ctx, scratch);
    if (gate) {
      return gate;
    }
    const base = `${ctx.clientUrl.replace(/\/+$/, "")}/api/data/v8.2/`;
    const probe = async (url: string): Promise<Response | undefined> => {
      ops.http("GET", url, { Accept: "application/json" });
      try {
        return await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
      } catch (error) {
        ops.note(`probe error ${errText(error)}`);
        return undefined;
      }
    };

    // $apply: the v8.2 contract says it is ABSENT; whatever comes back is the
    // finding, never a failure.
    const applyResponse = await probe(`${base}accounts?$apply=aggregate($count as c)`);
    const applyNote = applyResponse
      ? `$apply -> HTTP ${applyResponse.status} (${applyResponse.ok ? "present, so the modern engine answers it on the v8.2 path" : "absent, matching the v8.2 contract"})`
      : "$apply -> probe error";
    ops.note(applyNote);

    // Collection-valued $expand: report inline rows vs @odata.nextLink deferral.
    const expandResponse = await probe(
      `${base}accounts?$select=name&$top=1&$expand=contact_customer_accounts($select=fullname)`
    );
    let expandNote = "collection $expand -> probe error";
    if (expandResponse) {
      if (!expandResponse.ok) {
        expandNote = `collection $expand -> HTTP ${expandResponse.status} (not evaluated further)`;
      } else {
        const body = asRecord(await expandResponse.json());
        const list = (body?.value as Array<Record<string, unknown>> | undefined) ?? [];
        const first = list[0];
        const shape = !first
          ? "no rows to inspect"
          : Array.isArray(first["contact_customer_accounts"])
            ? "inline rows"
            : typeof first["contact_customer_accounts@odata.nextLink"] === "string"
              ? "@odata.nextLink deferral"
              : "absent/empty";
        expandNote = `collection $expand -> ${shape}`;
      }
    }
    ops.note(expandNote);

    return pass(`${LAB_V82_PREFIX}${applyNote}; ${expandNote}. Reported, never a failure (the kit uses neither).`);
  },
};

//#endregion

//#region Mutations (tier 2)

const writeRoundtrip: ITestCase = {
  id: "t2-write-roundtrip",
  title: "Create / update / retrieve / delete an account",
  tier: 2,
  section: "Mutations",
  async run(ctx, _scratch, ops) {
    const stamp = new Date().toISOString();
    const name = `Kit adapter test ${stamp}`;
    const notes: string[] = [];
    let createdId: string | undefined;
    let outcome: ITestOutcome | undefined;
    try {
      ops.write(readVia(ctx), "account", { name });
      const created = await ctx.webAPI.createRecord("account", { name });
      if (!created || created.entityType !== "account" || !created.id) {
        outcome = fail(`createRecord returned an unexpected shape: ${JSON.stringify(created)}`);
      } else {
        createdId = created.id;
        notes.push(`created ${created.id}`);
        const newName = `${name} (updated)`;
        ops.write(readVia(ctx), `account(${createdId})`, { name: newName });
        const updated = await ctx.webAPI.updateRecord("account", createdId, { name: newName });
        notes.push(updated.id === createdId ? "updated" : `updated (returned id ${updated.id})`);
        const query = "?$select=accountid,name";
        ops.query(readVia(ctx), `account(${createdId})`, query);
        const record = await ctx.webAPI.retrieveRecord("account", createdId, query);
        const readBack = asRecord(record)?.name;
        if (readBack !== undefined && readBack !== newName) {
          outcome = fail(
            `retrieve read back name ${JSON.stringify(readBack)}, expected ${JSON.stringify(newName)}.`
          );
        } else {
          notes.push(readBack === undefined ? "retrieved (name not echoed)" : "retrieved, name matches");
          outcome = pass(notes.join("; "));
        }
      }
    } catch (error) {
      outcome = fail(`Write roundtrip threw: ${errText(error)}`);
    }

    // Cleanup ALWAYS runs, even on an assertion failure above; its status is
    // reported separately so a leftover record is loud.
    const cleanup = await loudDelete(ctx, ops, "account", createdId);
    const base = outcome ?? fail("write roundtrip produced no outcome");
    const status = cleanup.failed ? "fail" : base.status;
    return { status, detail: `${base.detail} | ${cleanup.text}` };
  },
};

const escapedLiteral: ITestCase = {
  id: "t2-escaped-literal",
  title: "Escaped literal positive case (create + exact-name FetchXML match)",
  tier: 2,
  section: "Mutations",
  async run(ctx, _scratch, ops) {
    const stamp = new Date().toISOString();
    // The five XML-sensitive characters in the name; escapeXml must round-trip them.
    const name = `Kit adapter test <&"'> ${stamp}`;
    let createdId: string | undefined;
    let outcome: ITestOutcome | undefined;
    try {
      ops.write(readVia(ctx), "account", { name });
      const created = await ctx.webAPI.createRecord("account", { name });
      createdId = created?.id;
      const fetchXml = `
      <fetch top='2'>
        <entity name='account'>
          <attribute name='accountid' />
          <attribute name='name' />
          <filter>
            <condition attribute='name' operator='eq' value='${LibraryUtils.escapeXml(name)}' />
          </filter>
        </entity>
      </fetch>`;
      ops.fetchXml(FETCH_VIA, "account", fetchXml);
      const rows = (await ctx.webAPI.fetch("account", fetchXml)).entities ?? [];
      ops.note(`exact-name query matched ${rows.length} row(s)`);
      if (rows.length !== 1) {
        outcome = fail(
          `Expected exactly 1 row for the escaped name, got ${rows.length}. ` +
            `The XML-sensitive characters did not round-trip through escapeXml.`
        );
      } else if (createdId && normalizeGuid(String(rows[0].accountid ?? "")) !== normalizeGuid(createdId)) {
        outcome = fail(`The matched row (${rows[0].accountid}) is not the created record (${createdId}).`);
      } else {
        outcome = pass("Escaped literal round-tripped: exactly 1 row matched by the exact name through escapeXml.");
      }
    } catch (error) {
      outcome = fail(`Escaped-literal roundtrip threw: ${errText(error)}`);
    }
    const cleanup = await loudDelete(ctx, ops, "account", createdId);
    const base = outcome ?? fail("escaped-literal produced no outcome");
    const status = cleanup.failed ? "fail" : base.status;
    return { status, detail: `${base.detail} | ${cleanup.text}` };
  },
};

const returnRepresentation: ITestCase = {
  id: "t2-return-representation",
  title: "Informational: Prefer return=representation on create",
  tier: 2,
  section: "Mutations",
  // A raw same-origin fetch, not the pinned surface, so it skips under a pin.
  channel: "version-explicit",
  async run(ctx, _scratch, ops) {
    if (!sameOriginAsHost(ctx) || typeof fetch !== "function") {
      return skip("return=representation probe runs only against the hosting org (same-origin).");
    }
    const url = `${apiBase(ctx)}accounts`;
    const name = `Kit adapter test repr ${new Date().toISOString()}`;
    const body = JSON.stringify({ name });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Prefer: "return=representation",
    };
    ops.http("POST", url, { Prefer: "return=representation", "Content-Type": "application/json" }, body);
    let createdId: string | undefined;
    let outcome: ITestOutcome | undefined;
    try {
      const response = await fetch(url, { method: "POST", credentials: "include", headers, body });
      const text = await response.text();
      const entityIdHeader = response.headers.get("OData-EntityId") ?? "";
      createdId = /\(([^)]+)\)/.exec(entityIdHeader)?.[1];
      if (!createdId) {
        // Representation body carries the id when the header is absent.
        try {
          const parsed = asRecord(text ? JSON.parse(text) : undefined);
          createdId = typeof parsed?.accountid === "string" ? parsed.accountid : undefined;
        } catch {
          // leave undefined; cleanup reports the leak loudly
        }
      }
      const bodyCameBack = text.trim().length > 0 && response.status === 201;
      ops.note(`HTTP ${response.status}; response body ${bodyCameBack ? "returned (return=representation honored)" : "empty (create returns no body)"}`);
      outcome = pass(
        `return=representation -> HTTP ${response.status}: body ${bodyCameBack ? "came back (8.2/9.x)" : "not returned (8.0/8.1 or ignored)"}. ` +
          `Informational; the kit's create reads the OData-EntityId header instead.`
      );
    } catch (error) {
      outcome = fail(`return=representation probe threw: ${errText(error)}`);
    }
    const cleanup = await loudDelete(ctx, ops, "account", createdId);
    const base = outcome ?? fail("return-representation produced no outcome");
    const status = cleanup.failed ? "fail" : base.status;
    return { status, detail: `${base.detail} | ${cleanup.text}` };
  },
};

const polymorphicBind: ITestCase = {
  id: "t2-polymorphic-bind",
  title: "Polymorphic @odata.bind (contact.parentcustomerid_account)",
  tier: 2,
  section: "Mutations",
  async run(ctx, _scratch, ops) {
    const stamp = new Date().toISOString();
    let accountId: string | undefined;
    let contactId: string | undefined;
    let outcome: ITestOutcome | undefined;
    try {
      const accountData = { name: `Kit adapter test parent ${stamp}` };
      ops.write(readVia(ctx), "account", accountData);
      accountId = (await ctx.webAPI.createRecord("account", accountData))?.id;
      if (!accountId) {
        outcome = fail("Could not create the parent account.");
      } else {
        const bindUrl = `/accounts(${normalizeGuid(accountId)})`;
        const contactData: Record<string, unknown> = {
          firstname: "Kit",
          lastname: `Adapter ${stamp}`,
          "parentcustomerid_account@odata.bind": bindUrl,
        };
        ops.write(readVia(ctx), "contact", contactData);
        contactId = (await ctx.webAPI.createRecord("contact", contactData))?.id;
        const query = "?$select=fullname,_parentcustomerid_value";
        ops.query(readVia(ctx), `contact(${contactId ?? "?"})`, query);
        const record = contactId ? await ctx.webAPI.retrieveRecord("contact", contactId, query) : {};
        const parentValue = normalizeGuid(String(record["_parentcustomerid_value"] ?? ""));
        const parentType = record[`_parentcustomerid_value${LOOKUP_LOGICAL_NAME}`];
        ops.note(`_parentcustomerid_value=${parentValue || "(empty)"}, lookuplogicalname=${JSON.stringify(parentType ?? null)}`);
        if (!parentValue) {
          outcome = fail("The polymorphic @odata.bind did not set _parentcustomerid_value on the contact.");
        } else if (parentValue !== normalizeGuid(accountId)) {
          outcome = fail(`_parentcustomerid_value ${parentValue} does not match the bound account ${accountId}.`);
        } else if (parentType !== "account") {
          outcome = fail(`lookuplogicalname is ${JSON.stringify(parentType)}, expected "account".`);
        } else {
          outcome = pass(`Polymorphic bind set _parentcustomerid_value to ${parentValue} with lookuplogicalname "account".`);
        }
      }
    } catch (error) {
      outcome = fail(`Polymorphic bind roundtrip threw: ${errText(error)}`);
    }
    // Delete the contact BEFORE the account: the bind blocks the parent's delete.
    const contactCleanup = await loudDelete(ctx, ops, "contact", contactId);
    const accountCleanup = await loudDelete(ctx, ops, "account", accountId);
    const base = outcome ?? fail("polymorphic bind produced no outcome");
    const status = contactCleanup.failed || accountCleanup.failed ? "fail" : base.status;
    return { status, detail: `${base.detail} | ${contactCleanup.text} | ${accountCleanup.text}` };
  },
};

//#endregion

/** The full registry, grouped by section, tier 1 first then tier 2, in execution order. */
export const testCases: readonly ITestCase[] = [
  // Context
  adapterSelection,
  globalContext,
  formatting,
  // Data reads
  webApiAccount,
  webApiContact,
  retrieveRecord,
  workingQuery,
  formattedValues,
  savedQueryOption,
  userSettingsRead,
  // FetchXML channel
  fetchXmlQuery,
  formattedValuesFetch,
  fetchPaging,
  linkEntityAlias,
  batchFallback,
  // Metadata
  entityMetadata,
  savedView,
  currencySymbol,
  metadataCast,
  // Capability probes
  whoAmI,
  hostDegradation,
  versionPath,
  applyAggregate,
  expandDeferral,
  countProbe,
  // API version lab
  labVersionSweep,
  labV82FetchXml,
  labV82Metadata,
  labV82Classifiers,
  // Mutations (tier 2)
  writeRoundtrip,
  escapedLiteral,
  returnRepresentation,
  polymorphicBind,
];

import type {
  AttributeKind,
  IAttributeMetadata,
  IEntityMetadata,
} from "../context/IViewModelContext";
import type { IOptionItem } from "../utils/EntityModel";

/**
 * The ONE place that navigates the standard metadata shape's under-documented
 * members.
 *
 * The contract the kit exposes (`context.utils.getEntityMetadata`) is the
 * standard client-API shape, passed through untouched from the host. Its
 * documented surface is thin; the rich attribute data sits in PascalCase under
 * each attribute's `attributeDescriptor`, undocumented and not contractual
 * (stable in practice, the platform's own controls rely on it). Every read of
 * those members is contained here as small facet helpers, so a platform wave
 * that shifts an encoding breaks one file with a dense test suite, not the
 * smart tier.
 *
 * Reads are deliberately tolerant. Where more than one encoding exists (a
 * label as a plain string or an OData-style `UserLocalizedLabel` object, an
 * enum as a number, a string, or a `{ Value }` wrapper, an option list as an
 * array, a keyed object, or `{ Options }`), each is accepted, because "which
 * encoding" is exactly the part with no contract, and the kit's own OData
 * synthesis (pre-v9 hosts) emits the OData flavors. Anything unrecognized
 * degrades: kind "other", flags false, extras undefined.
 */

type NativeRecord = Record<string, unknown>;

function asRecord(value: unknown): NativeRecord | undefined {
  return typeof value === "object" && value !== null ? (value as NativeRecord) : undefined;
}

//#region locating attributes

/**
 * Finds one attribute inside a standard entity metadata object. The attribute
 * list arrives as the store's ItemCollection (`get`/`getAll`), but a plain
 * array or a keyed object is accepted too. Returns undefined when the payload
 * carries no such attribute.
 */
export function findAttributeMetadata(
  entityMetadata: IEntityMetadata | undefined,
  attributeLogicalName: string
): IAttributeMetadata | undefined {
  const collection = asRecord(entityMetadata?.Attributes);
  if (!collection) {
    return undefined;
  }
  if (typeof collection.get === "function") {
    const direct = (collection.get as (name: string) => unknown)(attributeLogicalName);
    if (direct) {
      return direct as IAttributeMetadata;
    }
  }
  let entries: unknown[];
  if (typeof collection.getAll === "function") {
    entries = ((collection.getAll as () => unknown[])() ?? []) as unknown[];
  } else if (Array.isArray(entityMetadata?.Attributes)) {
    entries = entityMetadata?.Attributes as unknown[];
  } else {
    entries = Object.values(collection);
  }
  return entries.find((entry) => {
    const descriptor = descriptorOf(entry);
    return descriptor && readString(descriptor.LogicalName) === attributeLogicalName;
  }) as IAttributeMetadata | undefined;
}

/**
 * The PascalCase payload sits under `attributeDescriptor`; an item that
 * carries the PascalCase members directly (the kit's OData synthesis, or a
 * host handing the descriptor itself) is accepted as-is.
 */
function descriptorOf(item: unknown): NativeRecord | undefined {
  const record = asRecord(item);
  if (!record) {
    return undefined;
  }
  const descriptor = asRecord(record.attributeDescriptor);
  if (descriptor) {
    return descriptor;
  }
  return typeof record.LogicalName === "string" ? record : undefined;
}
//#endregion

//#region attribute facets

/** The attribute's localized display name, when readable. */
export function attributeDisplayName(attribute: IAttributeMetadata): string | undefined {
  return localizedText(descriptorOf(attribute)?.DisplayName);
}

/** The attribute's authored Description, when readable. */
export function attributeDescription(attribute: IAttributeMetadata): string | undefined {
  return localizedText(descriptorOf(attribute)?.Description);
}

/**
 * The kit-level classification used to pick presentational controls. Resolved
 * from whichever type field the store exposes: `Type` (the store's lowercase
 * string, e.g. "picklist"), `AttributeTypeName` (the OData-style
 * "PicklistType", possibly `{ Value }`-wrapped), or `AttributeType` (the
 * numeric AttributeTypeCode). A date-time attribute whose platform behavior
 * is date-only classifies as "date".
 */
export function attributeKind(attribute: IAttributeMetadata): AttributeKind {
  const descriptor = descriptorOf(attribute);
  if (!descriptor) {
    return "other";
  }
  const kind = rawKind(descriptor);
  return kind === "datetime" && isDateOnly(descriptor) ? "date" : kind;
}

/** True for ApplicationRequired/SystemRequired requirement levels. */
export function attributeRequired(attribute: IAttributeMetadata): boolean {
  const value = unwrapValue(descriptorOf(attribute)?.RequiredLevel);
  if (typeof value === "number") {
    // 0 None, 1 SystemRequired, 2 ApplicationRequired, 3 Recommended.
    return value === 1 || value === 2;
  }
  const text = readString(value);
  return text === "ApplicationRequired" || text === "SystemRequired";
}

/** True when the column has field-level (column) security enabled. */
export function attributeIsSecured(attribute: IAttributeMetadata): boolean {
  return descriptorOf(attribute)?.IsSecured === true;
}

/**
 * Whether the column's UPDATE operation can be restricted by field-level
 * security. False means an FLS profile can never deny update on it, so a
 * secured column with this false stays editable by everyone who can edit the
 * record. Undefined when the host did not carry the flag.
 */
export function attributeCanBeSecuredForUpdate(
  attribute: IAttributeMetadata
): boolean | undefined {
  return readBoolean(descriptorOf(attribute)?.CanBeSecuredForUpdate);
}

/** Whether the column's CREATE operation can be restricted by field-level security. */
export function attributeCanBeSecuredForCreate(
  attribute: IAttributeMetadata
): boolean | undefined {
  return readBoolean(descriptorOf(attribute)?.CanBeSecuredForCreate);
}

/** Whether the column's READ operation can be restricted by field-level security. */
export function attributeCanBeSecuredForRead(
  attribute: IAttributeMetadata
): boolean | undefined {
  return readBoolean(descriptorOf(attribute)?.CanBeSecuredForRead);
}

/**
 * The option list for optionset, multioptionset, and boolean kinds, in the
 * order the kit's presentational controls expect (booleans false-first).
 * Empty for other kinds or when no option set is readable.
 */
export function attributeOptions(attribute: IAttributeMetadata): IOptionItem[] {
  const descriptor = descriptorOf(attribute);
  if (!descriptor) {
    return [];
  }
  return rawKind(descriptor) === "boolean"
    ? readBooleanOptions(descriptor.OptionSet)
    : readOptions(descriptor.OptionSet);
}

/** Lookup target entity logical names; empty when not a lookup or unreadable. */
export function attributeTargets(attribute: IAttributeMetadata): string[] {
  const targets = descriptorOf(attribute)?.Targets;
  return Array.isArray(targets)
    ? targets.filter((target): target is string => typeof target === "string")
    : [];
}

/** Max length for text and memo attributes. */
export function attributeMaxLength(attribute: IAttributeMetadata): number | undefined {
  return readNumber(descriptorOf(attribute)?.MaxLength);
}

/** Numeric precision (decimal, double, money). */
export function attributePrecision(attribute: IAttributeMetadata): number | undefined {
  return readNumber(descriptorOf(attribute)?.Precision);
}

/**
 * Money PrecisionSource: 0 = the attribute precision applies, 1 = the record
 * currency's precision, 2 = the org pricing precision.
 */
export function attributePrecisionSource(attribute: IAttributeMetadata): number | undefined {
  return readNumber(descriptorOf(attribute)?.PrecisionSource);
}

/** Lower value bound (integer, decimal, double, money). */
export function attributeMinValue(attribute: IAttributeMetadata): number | undefined {
  return readNumber(descriptorOf(attribute)?.MinValue);
}

/** Upper value bound (integer, decimal, double, money). */
export function attributeMaxValue(attribute: IAttributeMetadata): number | undefined {
  return readNumber(descriptorOf(attribute)?.MaxValue);
}
//#endregion

//#region kind resolution

function rawKind(descriptor: NativeRecord): AttributeKind {
  const typeText =
    readString(unwrapValue(descriptor.Type)) ?? readString(unwrapValue(descriptor.AttributeTypeName));
  if (typeText) {
    const kind = KIND_BY_TYPE_TEXT[typeText.toLowerCase()];
    if (kind) {
      return kind;
    }
  }
  const typeCode = readNumber(unwrapValue(descriptor.AttributeType));
  if (typeCode !== undefined) {
    return KIND_BY_TYPE_CODE[typeCode] ?? "other";
  }
  return "other";
}

/**
 * One table for both string encodings: the store's lowercase names and the
 * OData `XxxType` names (keyed lowercase, so "PicklistType" matches too).
 */
const KIND_BY_TYPE_TEXT: Record<string, AttributeKind> = {
  string: "text",
  stringtype: "text",
  memo: "memo",
  memotype: "memo",
  picklist: "optionset",
  picklisttype: "optionset",
  state: "optionset",
  statetype: "optionset",
  status: "optionset",
  statustype: "optionset",
  multiselectpicklist: "multioptionset",
  multiselectpicklisttype: "multioptionset",
  lookup: "lookup",
  lookuptype: "lookup",
  customer: "lookup",
  customertype: "lookup",
  owner: "lookup",
  ownertype: "lookup",
  datetime: "datetime",
  datetimetype: "datetime",
  integer: "integer",
  integertype: "integer",
  bigint: "integer",
  biginttype: "integer",
  decimal: "decimal",
  decimaltype: "decimal",
  double: "double",
  doubletype: "double",
  money: "money",
  moneytype: "money",
  boolean: "boolean",
  booleantype: "boolean",
};

/** AttributeTypeCode values, the numeric encoding of the same classification. */
const KIND_BY_TYPE_CODE: Record<number, AttributeKind> = {
  0: "boolean",
  1: "lookup", // Customer
  2: "datetime",
  3: "decimal",
  4: "double",
  5: "integer",
  6: "lookup",
  7: "memo",
  8: "money",
  9: "lookup", // Owner
  11: "optionset",
  12: "optionset", // State
  13: "optionset", // Status
  14: "text",
  18: "integer", // BigInt
};

/**
 * Date-only detection. `Behavior` is authoritative when present (the platform
 * semantics: 2 / "DateOnly" means the value has no time portion); `Format` is
 * the fallback ("DateOnly" in the OData encoding, "date" in the store's).
 * "datetime" starts with "date", so the format match is exact, not a prefix.
 */
function isDateOnly(descriptor: NativeRecord): boolean {
  const behavior = unwrapValue(descriptor.Behavior);
  if (behavior !== undefined && behavior !== null) {
    return behavior === 2 || readString(behavior)?.toLowerCase() === "dateonly";
  }
  const format = readString(unwrapValue(descriptor.Format))?.toLowerCase();
  return format === "dateonly" || format === "date";
}
//#endregion

//#region value decoding

/** A localized label arrives as a plain string or the OData label object. */
function localizedText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value || undefined;
  }
  const label = (asRecord(value)?.UserLocalizedLabel as { Label?: string } | undefined)?.Label;
  return typeof label === "string" && label ? label : undefined;
}

/** Unwraps the OData `{ Value }` envelope, passing every other shape through. */
function unwrapValue(value: unknown): unknown {
  const record = asRecord(value);
  return record && "Value" in record ? record.Value : value;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
//#endregion

//#region options

/**
 * An option list arrives as `{ Options: [...] }`, a plain array, or a keyed
 * object of options. Each option carries `Value` and a `Label`/`Text` in
 * either label encoding, plus an optional `Color`.
 */
function readOptions(optionSet: unknown): IOptionItem[] {
  return optionEntries(optionSet).map(readOption);
}

/**
 * Boolean options: the OData encoding is `{ FalseOption, TrueOption }`; the
 * generic list encodings occur too. Emitted false-first (value order), the
 * order the kit's boolean control expects.
 */
function readBooleanOptions(optionSet: unknown): IOptionItem[] {
  const record = asRecord(optionSet);
  if (record && (record.FalseOption || record.TrueOption)) {
    const options: IOptionItem[] = [];
    if (record.FalseOption) {
      options.push(readOption(record.FalseOption));
    }
    if (record.TrueOption) {
      options.push(readOption(record.TrueOption));
    }
    return options;
  }
  return readOptions(optionSet).sort((a, b) => a.value - b.value);
}

function optionEntries(optionSet: unknown): unknown[] {
  if (Array.isArray(optionSet)) {
    return optionSet;
  }
  const record = asRecord(optionSet);
  if (!record) {
    return [];
  }
  if (record.Options !== undefined) {
    // `Options` itself follows the same encodings (array or keyed object).
    return optionEntries(record.Options);
  }
  // A keyed object of options ({ "1": {...} }): integer-like keys enumerate in
  // ascending order in JS, which is value order, deterministic. Entries that
  // carry no option value (a stray Name or IsGlobal field) are dropped.
  return Object.values(record).filter((entry) => {
    const option = asRecord(entry);
    return option !== undefined && ("Value" in option || "value" in option);
  });
}

function readOption(raw: unknown): IOptionItem {
  const record = asRecord(raw) ?? {};
  const value = readNumber(unwrapValue(record.Value)) ?? readNumber(record.value) ?? 0;
  const label =
    localizedText(record.Label) ?? localizedText(record.Text) ?? localizedText(record.text);
  const color = readString(record.Color) ?? readString(record.color);
  return {
    value,
    label: label ?? String(value),
    color: color || undefined,
  };
}
//#endregion

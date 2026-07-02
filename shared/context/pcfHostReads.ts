/**
 * Helpers for the reads a PCF control root makes against its host context:
 * the bound-parameter surface (documented) and the hosting form's identity
 * (undocumented, see below). Shared here so every kit PCF resolves them the
 * same way, and so a platform reshape of the undocumented surfaces is a
 * one-file fix instead of a hunt through the control roots.
 */

import { normalizeGuid, type IXrmLookupValue } from "../utils/EntityModel";

//#region Bound-parameter reads (documented surface)

/**
 * Structural slice of the documented per-user column security object on a
 * bound parameter (`parameters.value.security`).
 */
export interface IPcfParameterSecurityLike {
  security?: { editable?: boolean; readable?: boolean; secured?: boolean };
}

/**
 * Per-user column security from the documented bound-property surface:
 * render read-only when the user cannot edit the column. Undefined when the
 * column is not secured, in which case the caller's default applies (the
 * kit's shared metadata path fails safe to read-only; here the host tells us
 * the user's REAL access, so an editable secured column stays editable).
 */
export function securedReadOnly(parameter: unknown): boolean | undefined {
  const security = (parameter as IPcfParameterSecurityLike | undefined)?.security;
  if (!security || security.secured === false) {
    return undefined;
  }
  return security.editable === false ? true : false;
}

//#endregion

//#region Host form identity (undocumented surface)

/**
 * Structural slice of the two places the platform exposes the hosting form's
 * record on a model-driven form. Neither is documented: `mode.contextInfo`
 * is undocumented but stable (absent from the published Mode interface,
 * which is why callers cast), and `page` is the older equally-undocumented
 * fallback. There is no documented in-context source for "what form am I
 * on" in a virtual field or dataset PCF, so the kit reads these here, in one
 * place, and every consumer degrades readably when both are absent (custom
 * pages and canvas apps do not populate them, which is what scopes the
 * smart-tier PCFs to model-driven forms).
 */
interface IPcfHostContextLike {
  mode?: {
    contextInfo?: { entityId?: string; entityTypeName?: string; entityRecordName?: string };
  };
  page?: { entityId?: string; entityTypeName?: string };
}

/**
 * The host form's entity logical name, which a field PCF needs to resolve
 * its bound column's metadata. Undefined off a model-driven form (or if the
 * platform ever removes both sources), in which case the control renders
 * its setup message.
 */
export function hostEntity(context: unknown): string | undefined {
  const host = context as IPcfHostContextLike;
  return host.mode?.contextInfo?.entityTypeName ?? host.page?.entityTypeName;
}

/**
 * The host form's record reference (id + entity + name), for controls that
 * file new records against the form's record. Undefined off a record form.
 */
export function hostRecord(context: unknown): IXrmLookupValue | undefined {
  const host = context as IPcfHostContextLike;
  const id = host.mode?.contextInfo?.entityId ?? host.page?.entityId;
  const entityType = host.mode?.contextInfo?.entityTypeName ?? host.page?.entityTypeName;
  if (!id || !entityType) {
    return undefined;
  }
  return {
    id: normalizeGuid(id),
    entityType,
    name: host.mode?.contextInfo?.entityRecordName ?? "",
  };
}

//#endregion

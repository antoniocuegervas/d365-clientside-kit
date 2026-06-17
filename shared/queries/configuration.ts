import type { IViewModelContext } from "../context/IViewModelContext";
import { LibraryUtils } from "../utils/LibraryUtils";

/**
 * The "configuration entity" pattern: a custom table holds key/value
 * settings (one row per key) that apps read at runtime instead of hardcoding
 * environment-specific values. Appears on nearly every D365 project.
 */
export interface IConfigurationParameterOptions {
  /** Configuration entity logical name (the kit's adapters pluralize it). */
  entity: string;
  /** Attribute holding the parameter key. */
  nameField: string;
  /** Attribute holding the parameter value to return. */
  valueField: string;
  /** The key to look up. */
  key: string;
}

/**
 * Resolves a single configuration parameter value. Proven semantics:
 * exactly one match returns its value; zero matches throws "not found";
 * more than one throws "duplicated", config keys are expected to be unique.
 */
export async function getConfigurationParameter(
  context: IViewModelContext,
  options: IConfigurationParameterOptions
): Promise<unknown> {
  const { entity, nameField, valueField, key } = options;
  const query =
    `?$select=${valueField}&$filter=${nameField} eq '${LibraryUtils.escapeODataString(key)}'`;
  const result = await context.webAPI.retrieveMultipleRecords(entity, query);
  if (result.entities.length === 0) {
    throw new Error(`Configuration parameter '${key}' not found`);
  }
  if (result.entities.length > 1) {
    throw new Error(`Duplicated configuration parameter '${key}'`);
  }
  return result.entities[0][valueField];
}

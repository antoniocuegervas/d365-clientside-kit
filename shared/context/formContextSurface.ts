/**
 * formContextSurface, the single kit-owned mirror of the native form object
 * model (`formContext` on modern/PCF, classic `Xrm.Page` on V8). One builder,
 * buildFormContext, wraps a host FormContextLike into the kit interfaces so call
 * sites read like the Xrm docs while staying host-uniform and fake-friendly
 * (the "option B" shape used across the context adapters).
 *
 * The classic Xrm.Page API is shape-compatible with modern/PCF formContext for
 * the core, so the one wrapper covers all three hosts. Methods a leaner host
 * (the CRM 8.x Page) does not expose are feature-detected and rejected with a
 * clear "not supported" error rather than failing as undefined-is-not-a-function.
 */

import { normalizeGuid, type IOptionItem, type IXrmLookupValue } from "../utils/EntityModel";

//#region kit-owned interfaces

/** A form collection (attributes, controls, tabs, sections), mirroring Xrm collections. */
export interface IFormCollection<T> {
  /** By logical name or zero-based index; null when absent. */
  get(nameOrIndex: string | number): T | null;
  getAll(): T[];
  forEach(callback: (item: T, index: number) => void): void;
  getLength(): number;
}

/** A form handler, the execution-context callback Xrm passes (kept opaque). */
export type FormEventHandler = (context?: unknown) => void;

/** Mirrors a form attribute (`formContext.getAttribute`, `entity.attributes`). */
export interface IAttribute {
  getName(): string;
  getValue<T = unknown>(): T | null;
  setValue(value: unknown): void;
  /** Attribute type, e.g. "string", "optionset", "money", "lookup". */
  getAttributeType(): string;
  /** Format hint, e.g. "email", "date", "duration"; null when none. */
  getFormat(): string | null;
  getIsDirty(): boolean;
  /** "none" | "required" | "recommended". */
  getRequiredLevel(): string;
  setRequiredLevel(level: string): void;
  /** "always" | "never" | "dirty". */
  getSubmitMode(): string;
  setSubmitMode(mode: string): void;
  addOnChange(handler: FormEventHandler): void;
  removeOnChange(handler: FormEventHandler): void;
  fireOnChange(): void;
  controls: IFormCollection<IControl>;
  /** Optionset attributes only: the available options. Throws otherwise. */
  getOptions(): IOptionItem[];
  /** Number attributes only. Throws on other types. */
  getMin(): number;
  getMax(): number;
  getPrecision(): number;
  /** String attributes only. Throws on other types. */
  getMaxLength(): number;
}

/** Mirrors a form control (`formContext.getControl`, `attribute.controls`). */
export interface IControl {
  getName(): string;
  getControlType(): string;
  /** The bound attribute, when this is a data control; null otherwise. */
  getAttribute(): IAttribute | null;
  getVisible(): boolean;
  setVisible(visible: boolean): void;
  getDisabled(): boolean;
  setDisabled(disabled: boolean): void;
  getLabel(): string;
  setLabel(label: string): void;
  setFocus(): void;
  setNotification(message: string, uniqueId: string): void;
  clearNotification(uniqueId: string): void;
  /** Lookup controls only: add a FetchXML filter. Throws on other control types. */
  addCustomFilter(filterXml: string, entityLogicalName?: string): void;
  /** Lookup controls only. */
  addCustomView(
    viewId: string,
    entityName: string,
    viewDisplayName: string,
    fetchXml: string,
    layoutXml: string,
    isDefault: boolean
  ): void;
  /** Lookup controls only. */
  addPreSearch(handler: FormEventHandler): void;
  removePreSearch(handler: FormEventHandler): void;
  getDefaultView(): string;
  setDefaultView(viewId: string): void;
  setEntityTypes(entityTypes: string[]): void;
  /** Optionset controls only: add/remove/clear an option. Throws on other types. */
  addOption(option: IOptionItem, index?: number): void;
  removeOption(value: number): void;
  clearOptions(): void;
}

/** Mirrors a form section (`tab.sections`). */
export interface ISection {
  getName(): string;
  getVisible(): boolean;
  setVisible(visible: boolean): void;
  getLabel(): string;
  setLabel(label: string): void;
  controls: IFormCollection<IControl>;
}

/** Mirrors a form tab (`ui.tabs`). */
export interface ITab {
  getName(): string;
  getVisible(): boolean;
  setVisible(visible: boolean): void;
  /** "expanded" | "collapsed". */
  getDisplayState(): string;
  setDisplayState(state: string): void;
  setFocus(): void;
  sections: IFormCollection<ISection>;
  addTabStateChange(handler: FormEventHandler): void;
  removeTabStateChange(handler: FormEventHandler): void;
}

/** Mirrors the record entity (`formContext.data.entity`). */
export interface IFormEntity {
  /** Normalized record id, or "" while the record is unsaved. */
  getId(): string;
  getEntityName(): string;
  /** Normalized lookup reference to the record. */
  getEntityReference(): IXrmLookupValue;
  getIsDirty(): boolean;
  getDataXml(): string;
  /**
   * Saves the record. `saveMode` mirrors the native entity.save argument
   * ("saveandclose", "saveandnew"). Resolves when the save COMPLETES on hosts
   * exposing the promise-returning data-level save (modern UCI); on hosts
   * without it (CRM 8.x) it resolves when the save is queued, the only
   * semantics the native void API offers there.
   */
  save(saveMode?: string): Promise<void>;
  attributes: IFormCollection<IAttribute>;
  addOnSave(handler: FormEventHandler): void;
  removeOnSave(handler: FormEventHandler): void;
  /** Post-save handler; not available on the CRM 8.x host. */
  addOnPostSave(handler: FormEventHandler): void;
}

/** A business-process-flow step. */
export interface IProcessStep {
  getName(): string;
  getAttribute(): string;
  getRequired(): boolean;
}

/** A business-process-flow stage. */
export interface IProcessStage {
  getId(): string;
  getName(): string;
  /** "active" | "inactive". */
  getStatus(): string;
  getSteps(): IFormCollection<IProcessStep>;
}

/** A business process flow. */
export interface IProcess {
  getId(): string;
  getName(): string;
  getStages(): IFormCollection<IProcessStage>;
}

/** Mirrors the BPF process API (`formContext.data.process` / `ui.process`). */
export interface IFormProcess {
  getActiveProcess(): IProcess | null;
  setActiveProcess(processId: string): Promise<void>;
  getActiveStage(): IProcessStage | null;
  setActiveStage(stageId: string): Promise<void>;
  moveNext(): Promise<string>;
  movePrevious(): Promise<string>;
  getEnabledProcesses(): Promise<IProcess[]>;
}

/** Mirrors `formContext.data`. */
export interface IFormData {
  entity: IFormEntity;
  getIsDirty(): boolean;
  /** Reloads the data; `save` true saves first. */
  refresh(save?: boolean): Promise<void>;
  /** Saves the record. `saveOptions` mirrors the native data.save argument. */
  save(saveOptions?: unknown): Promise<void>;
  addOnLoad(handler: FormEventHandler): void;
  removeOnLoad(handler: FormEventHandler): void;
  /** BPF process API when the form runs a process; undefined otherwise. */
  readonly process?: IFormProcess;
}

/** Mirrors `formContext.ui`. */
export interface IFormUi {
  setFormNotification(message: string, level: string, uniqueId: string): boolean;
  clearFormNotification(uniqueId: string): boolean;
  /** XrmEnum FormType integer: 1 create, 2 update, 3 readonly, etc. */
  getFormType(): number;
  refreshRibbon(): void;
  tabs: IFormCollection<ITab>;
  controls: IFormCollection<IControl>;
  /** BPF process API on the ui surface, when present. */
  readonly process?: IFormProcess;
}

/** Mirrors the native `formContext` object model. */
export interface IFormContext {
  getAttribute(attributeLogicalName: string): IAttribute | null;
  getControl(controlName: string): IControl | null;
  data: IFormData;
  ui: IFormUi;
}

//#endregion

//#region host structural slices

type HostCollection<T> = {
  get(nameOrIndex: string | number): T | null | undefined;
  getAll?(): T[];
  forEach?(callback: (item: T, index: number) => void): void;
  getLength?(): number;
};

interface HostControl {
  getName?(): string;
  getControlType?(): string;
  getAttribute?(): HostAttribute | null;
  getVisible?(): boolean;
  setVisible?(visible: boolean): void;
  getDisabled?(): boolean;
  setDisabled?(disabled: boolean): void;
  getLabel?(): string;
  setLabel?(label: string): void;
  setFocus?(): void;
  setNotification?(message: string, uniqueId: string): void;
  clearNotification?(uniqueId: string): void;
  addCustomFilter?(filterXml: string, entityLogicalName?: string): void;
  addCustomView?(...args: unknown[]): void;
  addPreSearch?(handler: FormEventHandler): void;
  removePreSearch?(handler: FormEventHandler): void;
  getDefaultView?(): string;
  setDefaultView?(viewId: string): void;
  setEntityTypes?(entityTypes: string[]): void;
  addOption?(option: unknown, index?: number): void;
  removeOption?(value: number): void;
  clearOptions?(): void;
}

interface HostAttribute {
  getName?(): string;
  getValue?(): unknown;
  setValue?(value: unknown): void;
  getAttributeType?(): string;
  getFormat?(): string | null;
  getIsDirty?(): boolean;
  getRequiredLevel?(): string;
  setRequiredLevel?(level: string): void;
  getSubmitMode?(): string;
  setSubmitMode?(mode: string): void;
  addOnChange?(handler: FormEventHandler): void;
  removeOnChange?(handler: FormEventHandler): void;
  fireOnChange?(): void;
  controls?: HostCollection<HostControl>;
  getOptions?(): unknown[];
  getMin?(): number;
  getMax?(): number;
  getPrecision?(): number;
  getMaxLength?(): number;
}

interface HostSection {
  getName?(): string;
  getVisible?(): boolean;
  setVisible?(visible: boolean): void;
  getLabel?(): string;
  setLabel?(label: string): void;
  controls?: HostCollection<HostControl>;
}

interface HostTab {
  getName?(): string;
  getVisible?(): boolean;
  setVisible?(visible: boolean): void;
  getDisplayState?(): string;
  setDisplayState?(state: string): void;
  setFocus?(): void;
  sections?: HostCollection<HostSection>;
  addTabStateChange?(handler: FormEventHandler): void;
  removeTabStateChange?(handler: FormEventHandler): void;
}

interface HostProcessStep {
  getName?(): string;
  getAttribute?(): string;
  getRequired?(): boolean;
}
interface HostProcessStage {
  getId?(): string;
  getName?(): string;
  getStatus?(): string;
  getSteps?(): HostCollection<HostProcessStep>;
}
interface HostProcess {
  getId?(): string;
  getName?(): string;
  getStages?(): HostCollection<HostProcessStage>;
}
interface HostProcessManager {
  getActiveProcess?(): HostProcess | null;
  setActiveProcess?(processId: string, callback?: (status: string) => void): void;
  getActiveStage?(): HostProcessStage | null;
  setActiveStage?(stageId: string, callback?: (status: string) => void): void;
  moveNext?(callback?: (status: string) => void): void;
  movePrevious?(callback?: (status: string) => void): void;
  getEnabledProcesses?(callback: (processes: Record<string, string>) => void): void;
}

interface HostEntity {
  getId?(): string;
  getEntityName?(): string;
  getEntityReference?(): { id?: string; entityType?: string; name?: string };
  getIsDirty?(): boolean;
  getDataXml?(): string;
  save?(saveMode?: unknown): unknown;
  attributes?: HostCollection<HostAttribute>;
  addOnSave?(handler: FormEventHandler): void;
  removeOnSave?(handler: FormEventHandler): void;
  addOnPostSave?(handler: FormEventHandler): void;
}

interface HostData {
  entity?: HostEntity;
  getIsDirty?(): boolean;
  refresh?(save?: boolean): PromiseLike<unknown>;
  save?(saveOptions?: unknown): PromiseLike<unknown>;
  addOnLoad?(handler: FormEventHandler): void;
  removeOnLoad?(handler: FormEventHandler): void;
  process?: HostProcessManager;
}

interface HostUi {
  setFormNotification?(message: string, level: string, uniqueId: string): boolean;
  clearFormNotification?(uniqueId: string): boolean;
  getFormType?(): number;
  refreshRibbon?(): void;
  tabs?: HostCollection<HostTab>;
  controls?: HostCollection<HostControl>;
  process?: HostProcessManager;
}

/** Structural slice of a host form context the builder reads. */
export interface IHostFormContext {
  getAttribute?(name: string): HostAttribute | null;
  getControl?(name: string): HostControl | null;
  data?: HostData;
  ui?: HostUi;
}

//#endregion

//#region builder

function unsupported(member: string, hostLabel: string): never {
  throw new Error(`formContext.${member} is not supported on the ${hostLabel} host.`);
}

/** Returns the host method bound to its owner, or throws a clear error. */
function need<T extends (...args: never[]) => unknown>(
  fn: T | undefined,
  owner: object,
  member: string,
  hostLabel: string
): T {
  if (typeof fn !== "function") {
    unsupported(member, hostLabel);
  }
  return fn.bind(owner) as T;
}

/** Wraps a host collection (or a missing one) into the kit collection. */
function wrapCollection<H, K>(
  host: HostCollection<H> | undefined,
  wrapItem: (item: H) => K
): IFormCollection<K> {
  const getAll = (): K[] => {
    const items = host?.getAll?.() ?? [];
    return items.map(wrapItem);
  };
  return {
    get: (nameOrIndex) => {
      const item = host?.get(nameOrIndex);
      return item ? wrapItem(item) : null;
    },
    getAll,
    forEach: (callback) => getAll().forEach(callback),
    getLength: () => host?.getLength?.() ?? host?.getAll?.()?.length ?? 0,
  };
}

function wrapControl(host: HostControl, hostLabel: string): IControl {
  return {
    getName: () => host.getName?.() ?? "",
    getControlType: () => host.getControlType?.() ?? "",
    getAttribute: () => {
      const attribute = host.getAttribute?.();
      return attribute ? wrapAttribute(attribute, hostLabel) : null;
    },
    getVisible: () => host.getVisible?.() ?? true,
    setVisible: (visible) => need(host.setVisible, host, "control.setVisible", hostLabel)(visible),
    getDisabled: () => host.getDisabled?.() ?? false,
    setDisabled: (disabled) =>
      need(host.setDisabled, host, "control.setDisabled", hostLabel)(disabled),
    getLabel: () => host.getLabel?.() ?? "",
    setLabel: (label) => need(host.setLabel, host, "control.setLabel", hostLabel)(label),
    setFocus: () => need(host.setFocus, host, "control.setFocus", hostLabel)(),
    setNotification: (message, uniqueId) =>
      need(host.setNotification, host, "control.setNotification", hostLabel)(message, uniqueId),
    clearNotification: (uniqueId) =>
      need(host.clearNotification, host, "control.clearNotification", hostLabel)(uniqueId),
    addCustomFilter: (filterXml, entityLogicalName) =>
      need(host.addCustomFilter, host, "control.addCustomFilter", hostLabel)(
        filterXml,
        entityLogicalName
      ),
    addCustomView: (...args) =>
      (need(host.addCustomView, host, "control.addCustomView", hostLabel) as (...a: unknown[]) => void)(
        ...args
      ),
    addPreSearch: (handler) =>
      need(host.addPreSearch, host, "control.addPreSearch", hostLabel)(handler),
    removePreSearch: (handler) =>
      need(host.removePreSearch, host, "control.removePreSearch", hostLabel)(handler),
    getDefaultView: () => need(host.getDefaultView, host, "control.getDefaultView", hostLabel)(),
    setDefaultView: (viewId) =>
      need(host.setDefaultView, host, "control.setDefaultView", hostLabel)(viewId),
    setEntityTypes: (entityTypes) =>
      need(host.setEntityTypes, host, "control.setEntityTypes", hostLabel)(entityTypes),
    addOption: (option, index) =>
      need(host.addOption, host, "control.addOption", hostLabel)(option, index),
    removeOption: (value) => need(host.removeOption, host, "control.removeOption", hostLabel)(value),
    clearOptions: () => need(host.clearOptions, host, "control.clearOptions", hostLabel)(),
  };
}

function wrapAttribute(host: HostAttribute, hostLabel: string): IAttribute {
  return {
    getName: () => host.getName?.() ?? "",
    getValue: <T = unknown>() => (host.getValue?.() as T | undefined) ?? null,
    setValue: (value) => need(host.setValue, host, "attribute.setValue", hostLabel)(value),
    getAttributeType: () => host.getAttributeType?.() ?? "",
    getFormat: () => host.getFormat?.() ?? null,
    getIsDirty: () => host.getIsDirty?.() ?? false,
    getRequiredLevel: () => host.getRequiredLevel?.() ?? "none",
    setRequiredLevel: (level) =>
      need(host.setRequiredLevel, host, "attribute.setRequiredLevel", hostLabel)(level),
    getSubmitMode: () => host.getSubmitMode?.() ?? "dirty",
    setSubmitMode: (mode) =>
      need(host.setSubmitMode, host, "attribute.setSubmitMode", hostLabel)(mode),
    addOnChange: (handler) =>
      need(host.addOnChange, host, "attribute.addOnChange", hostLabel)(handler),
    removeOnChange: (handler) =>
      need(host.removeOnChange, host, "attribute.removeOnChange", hostLabel)(handler),
    fireOnChange: () => need(host.fireOnChange, host, "attribute.fireOnChange", hostLabel)(),
    controls: wrapCollection(host.controls, (control) => wrapControl(control, hostLabel)),
    getOptions: () =>
      (need(host.getOptions, host, "attribute.getOptions", hostLabel)() as IOptionItem[]) ?? [],
    getMin: () => need(host.getMin, host, "attribute.getMin", hostLabel)(),
    getMax: () => need(host.getMax, host, "attribute.getMax", hostLabel)(),
    getPrecision: () => need(host.getPrecision, host, "attribute.getPrecision", hostLabel)(),
    getMaxLength: () => need(host.getMaxLength, host, "attribute.getMaxLength", hostLabel)(),
  };
}

function wrapSection(host: HostSection, hostLabel: string): ISection {
  return {
    getName: () => host.getName?.() ?? "",
    getVisible: () => host.getVisible?.() ?? true,
    setVisible: (visible) => need(host.setVisible, host, "section.setVisible", hostLabel)(visible),
    getLabel: () => host.getLabel?.() ?? "",
    setLabel: (label) => need(host.setLabel, host, "section.setLabel", hostLabel)(label),
    controls: wrapCollection(host.controls, (control) => wrapControl(control, hostLabel)),
  };
}

function wrapTab(host: HostTab, hostLabel: string): ITab {
  return {
    getName: () => host.getName?.() ?? "",
    getVisible: () => host.getVisible?.() ?? true,
    setVisible: (visible) => need(host.setVisible, host, "tab.setVisible", hostLabel)(visible),
    getDisplayState: () => host.getDisplayState?.() ?? "expanded",
    setDisplayState: (state) =>
      need(host.setDisplayState, host, "tab.setDisplayState", hostLabel)(state),
    setFocus: () => need(host.setFocus, host, "tab.setFocus", hostLabel)(),
    sections: wrapCollection(host.sections, (section) => wrapSection(section, hostLabel)),
    addTabStateChange: (handler) =>
      need(host.addTabStateChange, host, "tab.addTabStateChange", hostLabel)(handler),
    removeTabStateChange: (handler) =>
      need(host.removeTabStateChange, host, "tab.removeTabStateChange", hostLabel)(handler),
  };
}

function wrapProcess(host: HostProcess): IProcess {
  return {
    getId: () => host.getId?.() ?? "",
    getName: () => host.getName?.() ?? "",
    getStages: () => wrapCollection(host.getStages?.(), (stage) => wrapProcessStage(stage)),
  };
}

function wrapProcessStage(host: HostProcessStage): IProcessStage {
  return {
    getId: () => host.getId?.() ?? "",
    getName: () => host.getName?.() ?? "",
    getStatus: () => host.getStatus?.() ?? "",
    getSteps: () =>
      wrapCollection(host.getSteps?.(), (step) => ({
        getName: () => step.getName?.() ?? "",
        getAttribute: () => step.getAttribute?.() ?? "",
        getRequired: () => step.getRequired?.() ?? false,
      })),
  };
}

function wrapProcessManager(host: HostProcessManager, hostLabel: string): IFormProcess {
  // The native move/set calls are callback-based; wrap them as promises.
  const callbackToPromise = <T>(
    invoke: ((cb: (value: T) => void) => void) | undefined,
    member: string
  ): Promise<T> =>
    new Promise((resolve) => need(invoke, host, member, hostLabel)((value: T) => resolve(value)));
  return {
    getActiveProcess: () => {
      const process = host.getActiveProcess?.();
      return process ? wrapProcess(process) : null;
    },
    setActiveProcess: (processId) =>
      new Promise<void>((resolve) =>
        need(host.setActiveProcess, host, "process.setActiveProcess", hostLabel)(processId, () =>
          resolve()
        )
      ),
    getActiveStage: () => {
      const stage = host.getActiveStage?.();
      return stage ? wrapProcessStage(stage) : null;
    },
    setActiveStage: (stageId) =>
      new Promise<void>((resolve) =>
        need(host.setActiveStage, host, "process.setActiveStage", hostLabel)(stageId, () =>
          resolve()
        )
      ),
    moveNext: () => callbackToPromise<string>(host.moveNext, "process.moveNext"),
    movePrevious: () => callbackToPromise<string>(host.movePrevious, "process.movePrevious"),
    getEnabledProcesses: () =>
      new Promise<IProcess[]>((resolve) =>
        need(host.getEnabledProcesses, host, "process.getEnabledProcesses", hostLabel)((processes) =>
          resolve(
            Object.entries(processes ?? {}).map(([id, name]) =>
              wrapProcess({ getId: () => id, getName: () => name })
            )
          )
        )
      ),
  };
}

/** entity.save's string modes mapped to data.save's numeric saveMode values. */
const entitySaveModes: Record<string, number> = {
  saveandclose: 2,
  saveandnew: 59,
};

function wrapEntity(
  host: HostEntity,
  hostLabel: string,
  dataSave?: (saveOptions?: unknown) => PromiseLike<unknown>
): IFormEntity {
  return {
    getId: () => {
      const id = host.getId?.() ?? "";
      return id ? normalizeGuid(id) : "";
    },
    getEntityName: () => host.getEntityName?.() ?? "",
    getEntityReference: () => {
      const reference = host.getEntityReference?.();
      return {
        id: reference?.id ? normalizeGuid(reference.id) : "",
        entityType: reference?.entityType ?? host.getEntityName?.() ?? "",
        name: reference?.name,
      };
    },
    getIsDirty: () => host.getIsDirty?.() ?? false,
    getDataXml: () => need(host.getDataXml, host, "entity.getDataXml", hostLabel)(),
    save: async (saveMode) => {
      // The native entity.save returns void at QUEUE time; the data-level save
      // returns a real completion promise. Prefer it where the host has one,
      // so `await save()` means "saved" (a follow-up getRecordId or query sees
      // the committed record). Hosts without it (CRM 8.x) keep the native
      // call, which resolves when the save is queued, not done.
      if (dataSave) {
        const mode = entitySaveModes[saveMode?.toLowerCase() ?? ""];
        await dataSave(mode !== undefined ? { saveMode: mode } : undefined);
        return;
      }
      await Promise.resolve(need(host.save, host, "entity.save", hostLabel)(saveMode));
    },
    attributes: wrapCollection(host.attributes, (attribute) => wrapAttribute(attribute, hostLabel)),
    addOnSave: (handler) => need(host.addOnSave, host, "entity.addOnSave", hostLabel)(handler),
    removeOnSave: (handler) =>
      need(host.removeOnSave, host, "entity.removeOnSave", hostLabel)(handler),
    addOnPostSave: (handler) =>
      need(host.addOnPostSave, host, "entity.addOnPostSave", hostLabel)(handler),
  };
}

function wrapData(host: HostData, hostLabel: string): IFormData {
  const entity = host.entity;
  return {
    entity: wrapEntity(
      entity ?? {},
      hostLabel,
      host.save ? (saveOptions) => host.save!(saveOptions) : undefined
    ),
    getIsDirty: () => host.getIsDirty?.() ?? false,
    refresh: async (save) => {
      await need(host.refresh, host, "data.refresh", hostLabel)(save ?? false);
    },
    save: async (saveOptions) => {
      await need(host.save, host, "data.save", hostLabel)(saveOptions);
    },
    addOnLoad: (handler) => need(host.addOnLoad, host, "data.addOnLoad", hostLabel)(handler),
    removeOnLoad: (handler) =>
      need(host.removeOnLoad, host, "data.removeOnLoad", hostLabel)(handler),
    process: host.process ? wrapProcessManager(host.process, hostLabel) : undefined,
  };
}

function wrapUi(host: HostUi, hostLabel: string): IFormUi {
  return {
    setFormNotification: (message, level, uniqueId) =>
      need(host.setFormNotification, host, "ui.setFormNotification", hostLabel)(
        message,
        level,
        uniqueId
      ),
    clearFormNotification: (uniqueId) =>
      need(host.clearFormNotification, host, "ui.clearFormNotification", hostLabel)(uniqueId),
    getFormType: () => host.getFormType?.() ?? 0,
    refreshRibbon: () => need(host.refreshRibbon, host, "ui.refreshRibbon", hostLabel)(),
    tabs: wrapCollection(host.tabs, (tab) => wrapTab(tab, hostLabel)),
    controls: wrapCollection(host.controls, (control) => wrapControl(control, hostLabel)),
    process: host.process ? wrapProcessManager(host.process, hostLabel) : undefined,
  };
}

/** True when the host object actually carries a record form behind it. */
export function hasForm(source: IHostFormContext | undefined): source is IHostFormContext {
  return !!source?.data?.entity;
}

/**
 * Wraps a host form context (`formContext` or classic `Xrm.Page`) into the kit
 * IFormContext. `hostLabel` names the host for the "not supported" errors raised
 * when a leaner host (CRM 8.x) lacks a member.
 */
export function buildFormContext(source: IHostFormContext, hostLabel: string): IFormContext {
  return {
    getAttribute: (name) => {
      // getAttribute is a shortcut for data.entity.attributes.get; fall back to
      // it so leaner hosts that only expose the entity collection still resolve.
      const attribute = source.getAttribute?.(name) ?? source.data?.entity?.attributes?.get(name);
      return attribute ? wrapAttribute(attribute, hostLabel) : null;
    },
    getControl: (name) => {
      const control = source.getControl?.(name) ?? source.ui?.controls?.get(name);
      return control ? wrapControl(control, hostLabel) : null;
    },
    data: wrapData(source.data ?? {}, hostLabel),
    ui: wrapUi(source.ui ?? {}, hostLabel),
  };
}

//#endregion

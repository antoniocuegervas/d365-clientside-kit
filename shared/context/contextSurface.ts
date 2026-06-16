import {
  ClientFormFactor,
  type IClientContext,
  type IContextUtils,
  type IDeviceContext,
  type IFileDetails,
  type IGeoPosition,
} from "./IViewModelContext";

/**
 * Shared builders for the seamless platform-mirror surface (N-03): `client`,
 * `device`, and the `Xrm.Utility` extras on `utils`. Modern webresource and PCF
 * hosts expose the same method names (`globalContext.client.*` / `Xrm.Device.*`
 * vs `context.client.*` / `context.device.*`), so one structural builder serves
 * both; V8 / capability-less hosts get clear "not supported" stubs.
 */

/** Structural slice of `GlobalContext.client` / PCF `context.client`. */
export interface IXrmClientLike {
  getFormFactor?(): number;
  getClient?(): string;
  getClientState?(): string;
  isOffline?(): boolean;
}

/** Structural slice of `Xrm.Device` / PCF `context.device`. */
export interface IXrmDeviceLike {
  captureImage?(options?: unknown): PromiseLike<unknown>;
  captureAudio?(): PromiseLike<unknown>;
  captureVideo?(): PromiseLike<unknown>;
  getBarcodeValue?(): PromiseLike<unknown>;
  getCurrentPosition?(): PromiseLike<unknown>;
  pickFile?(options?: unknown): PromiseLike<unknown>;
}

/** Structural slice of the `Xrm.Utility` extras the kit mirrors. */
export interface IXrmUtilityExtras {
  getResourceString?(webResourceName: string, key: string): string;
  showProgressIndicator?(message: string): void;
  closeProgressIndicator?(): void;
  getAllowedStatusTransitions?(
    entityLogicalName: string,
    stateCode: number
  ): PromiseLike<unknown>;
  refreshParentGrid?(lookupValue: unknown): void;
}

/** Builds the kit `client` surface, defaulting members the host doesn't expose. */
export function clientFromSource(source: IXrmClientLike | undefined): IClientContext {
  return {
    getFormFactor: () => (source?.getFormFactor?.() as ClientFormFactor) ?? ClientFormFactor.Unknown,
    getClient: () => source?.getClient?.() ?? "Web",
    getClientState: () => source?.getClientState?.() ?? "Online",
    isOffline: () => source?.isOffline?.() ?? false,
  };
}

/** Builds the kit `device` surface; each member throws when the host lacks it. */
export function deviceFromSource(
  source: IXrmDeviceLike | undefined,
  hostLabel: string
): IDeviceContext {
  const fail = (capability: string): Promise<never> =>
    Promise.reject(new Error(`device.${capability} is not available in the ${hostLabel} host.`));
  return {
    captureImage: (options) =>
      source?.captureImage
        ? Promise.resolve(source.captureImage(options) as PromiseLike<IFileDetails | null>)
        : fail("captureImage"),
    captureAudio: () =>
      source?.captureAudio
        ? Promise.resolve(source.captureAudio() as PromiseLike<IFileDetails | null>)
        : fail("captureAudio"),
    captureVideo: () =>
      source?.captureVideo
        ? Promise.resolve(source.captureVideo() as PromiseLike<IFileDetails | null>)
        : fail("captureVideo"),
    getBarcodeValue: () =>
      source?.getBarcodeValue
        ? Promise.resolve(source.getBarcodeValue() as PromiseLike<string | null>)
        : fail("getBarcodeValue"),
    getCurrentPosition: () =>
      source?.getCurrentPosition
        ? Promise.resolve(source.getCurrentPosition() as PromiseLike<IGeoPosition | null>)
        : fail("getCurrentPosition"),
    pickFile: (options) =>
      source?.pickFile
        ? Promise.resolve(source.pickFile(options) as PromiseLike<IFileDetails[]>)
        : fail("pickFile"),
  };
}

/**
 * Builds the kit `utils` surface (alert + Xrm.Utility extras) from a structural
 * `Xrm.Utility`. Members the host lacks degrade: string getters return
 * undefined, void methods no-op, and `getAllowedStatusTransitions` rejects.
 */
export function utilsFromXrm(
  alert: (message: string) => void,
  utility: IXrmUtilityExtras | undefined,
  hostLabel: string
): IContextUtils {
  return {
    alert,
    getResourceString: (webResourceName, key) =>
      utility?.getResourceString?.(webResourceName, key) ?? undefined,
    showProgressIndicator: (message) => utility?.showProgressIndicator?.(message),
    closeProgressIndicator: () => utility?.closeProgressIndicator?.(),
    getAllowedStatusTransitions: (entityLogicalName, stateCode) =>
      utility?.getAllowedStatusTransitions
        ? Promise.resolve(utility.getAllowedStatusTransitions(entityLogicalName, stateCode))
        : Promise.reject(
            new Error(`getAllowedStatusTransitions is not available in the ${hostLabel} host.`)
          ),
    refreshParentGrid: (lookupValue) => utility?.refreshParentGrid?.(lookupValue),
  };
}

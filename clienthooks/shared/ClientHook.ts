import { createWebResourceContext } from "../../shared/context/createWebResourceContext";
import type { IViewModelContext } from "../../shared/context/IViewModelContext";

/**
 * Base class for form / ribbon / grid hooks.
 *
 * The kit context is created on FIRST USE, not at module load: the bundle is
 * registered as a CRM library webresource, so by the time any event handler
 * fires, Xrm is guaranteed present, but requiring the file must never
 * throw just because Xrm isn't there yet (test harnesses, eager loaders).
 *
 * Hook methods receive CRM event arguments (executionContext, PrimaryControl)
 * exactly as CRM passes them; per-form manipulation goes through LibraryUtils
 * with the event's formContext, while org-level work (queries, navigation)
 * uses `this.context`.
 */
export abstract class ClientHook {
  private contextInstance: IViewModelContext | undefined;

  protected get context(): IViewModelContext {
    if (!this.contextInstance) {
      this.contextInstance = createWebResourceContext();
    }
    return this.contextInstance;
  }

  /** Resolves the formContext from whatever CRM handed the handler. */
  protected static formContextOf(executionContextOrFormContext: unknown): Xrm.FormContext {
    const candidate = executionContextOrFormContext as {
      getFormContext?: () => Xrm.FormContext;
    };
    if (typeof candidate?.getFormContext === "function") {
      return candidate.getFormContext();
    }
    return executionContextOrFormContext as Xrm.FormContext;
  }
}

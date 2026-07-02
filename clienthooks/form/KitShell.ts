import type { IKitInjectedHost } from "../../shared/context/createWebResourceContext";

/**
 * Connects form-hosted shell webresources to the form's Xrm through the web
 * resource control's `getContentWindow`, the path Microsoft's deprecation
 * guidance prefers over `parent.Xrm` (which is listed for removal). With this
 * hook registered, the shell boots from the injected Xrm and form context and
 * only falls back to walking ancestor frames; without it (or for a
 * sitemap-hosted shell, which has no form to register it on) the walk remains
 * the boot path.
 *
 * Register on the form's OnLoad with "pass execution context as first
 * parameter" checked:
 *
 *   Library: <prefix>clienthooks.js
 *   Function: CrmClientSide.KitShell.connect
 *
 * By default every web resource control on the form is connected; pass a
 * control name as the handler's comma-separated string parameter to connect
 * just that one.
 */
export class KitShellForm {
  /** Arrow property so CRM can call the handler unbound. */
  readonly connect = (
    executionContext: Xrm.Events.EventContext,
    controlName?: string
  ): void => {
    const formContext = executionContext.getFormContext();
    const controls: IContentWindowControl[] = controlName
      ? [formContext.getControl(controlName) as unknown as IContentWindowControl]
      : allContentWindowControls(formContext);
    for (const control of controls) {
      injectInto(control, formContext);
    }
  };
}

/** The slice of a web resource / iframe control this hook relies on. */
interface IContentWindowControl {
  getContentWindow?(): Promise<Window>;
}

/** Every control on the form that can hand out a content window. */
function allContentWindowControls(formContext: Xrm.FormContext): IContentWindowControl[] {
  const found: IContentWindowControl[] = [];
  formContext.ui.controls.forEach((control) => {
    const candidate = control as unknown as IContentWindowControl;
    if (typeof candidate.getContentWindow === "function") {
      found.push(candidate);
    }
  });
  return found;
}

function injectInto(control: IContentWindowControl | null, formContext: Xrm.FormContext): void {
  if (!control || typeof control.getContentWindow !== "function") {
    return;
  }
  void control
    .getContentWindow()
    .then((win) => {
      const host = win as Window & IKitInjectedHost;
      // The form script's Xrm global is supported surface (the deprecation
      // applies to a webresource reaching for parent.Xrm, not to this).
      host.__kitInjectedXrm = Xrm;
      host.__kitInjectedFormPage =
        formContext as unknown as IKitInjectedHost["__kitInjectedFormPage"];
    })
    .catch((error) => {
      // A non-kit iframe may refuse; never let that break the form load.
      console.warn("KitShell.connect could not reach a content window", error);
    });
}

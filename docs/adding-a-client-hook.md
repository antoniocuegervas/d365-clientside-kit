# Adding a Client Hook

Hooks are form/ribbon/editable-grid handlers shipped in the `CrmClientSide`
UMD bundle (`dist/clienthooks/<prefix>clienthooks.js`). They are **templates**
webresource app logic lives in clientui ViewModels, never here.

## 1. Write the hook class

```ts
// clienthooks/form/ContactForm.ts
import * as LibraryUtils from "../../shared/utils/LibraryUtils";
import { ClientHook } from "../shared/ClientHook";

export class ContactForm extends ClientHook {
  // Arrow property, CRM calls handlers unbound.
  readonly onLoad = (executionContext: Xrm.Events.EventContext): void => {
    const formContext = ContactForm.formContextOf(executionContext);
    LibraryUtils.setFieldsRequired(formContext, ["emailaddress1"], "required");
  };
}
```

- Per-form manipulation: `LibraryUtils` + the event's formContext.
- Org-level work (queries, opening the shell): `this.context`
  (`IViewModelContext`, created lazily on first use).
- Validation UI without raw Xrm: `LibraryUtils.setFieldNotification` /
  `clearFieldNotification` (field-level icon + tooltip) and
  `setFormNotification` / `clearFormNotification` (form banner, level `"ERROR"
  | "WARNING" | "INFO"`). See `AccountForm.onSave` for the recommended-field
  pattern.

## 2. Export it on the registry

```ts
// clienthooks/index.ts
export const Contact = { Form: new ContactForm() };
```

The export path IS the registration name: `CrmClientSide.Contact.Form.onLoad`.
Reusable, entity-agnostic hooks get non-entity keys (`CrmClientSide.LockedGrid`).

## 3. Register in CRM

1. Upload `dist/clienthooks/<prefix>clienthooks.js` as a library webresource.
2. Form events: add the library, set the function name
   (`CrmClientSide.Contact.Form.onLoad`), check **pass execution context**.
3. Ribbon commands: custom action with the function name and `PrimaryControl`
   as CrmParameter (see `clienthooks/ribbon/AccountRibbon.ts` for the
   open-the-shell pattern).
4. Editable grids: register on grid events (`OnRecordSelect`) the same way.

CRM loads libraries before firing events, so Xrm is always present by the
time a handler runs, that ordering is the contract the lazy context relies on.

## Launching the shell from a hook

`context.navigation.openClientUI(webResourceName, appKey, payload?, options?)`
opens the clientui shell from a ribbon, command bar, or form handler. On modern
UCI it uses `Xrm.Navigation.navigateTo`, and `options.mode` selects the launch
surface:

- `"auto"` (the default) opens a centered modal dialog on a normal viewport and
  a full page on a narrow (phone) reflow, where the platform will not host a
  webresource dialog (it renders an empty "No data available."). Callers get the
  phone-safe launch without a viewport check of their own. The narrow check is
  measured on the top window, the application viewport, never the handler's own
  window: modern UCI runs ribbon and command-bar handlers inside a hidden
  iframe whose own viewport would read narrow on any device.
- `"modal"` and `"side"` always open the centered modal or the right-hand side
  pane, with `width`/`height` in pixels (80% when omitted) and an optional
  `title`.
- `"fullpage"` always opens a full page and marks the payload `fullPage: true`
  (a full-page webresource gets no platform back button on the web client). The
  clientui shell reads that marker and renders its own slim Back bar above the
  app automatically, so an app launched through the shell needs nothing; a
  consumer hosting its own page instead of the shell offers its own back
  button off the same marker.

`AccountRibbon` ships `openCompanySearch` (auto, so a modal on the desktop) and
`openCompanySearchPane` (side pane); `LibraryUtils.isNarrowViewport()` exposes
the same viewport check the auto mode uses, if a caller wants to branch itself.
Because the check reads the top window, an iframe that is itself narrow inside
a desktop app does not count as narrow; to simulate the phone reflow, narrow
the top window (browser device emulation or a window resize), not just an
iframe. The legacy (V8) and PCF hosts fall back to a popup window and honor
only width/height, so every mode resolves to that one popup there.

## 4. Verify

Add assertions to `tests/smoke/clienthooks.smoke.test.ts`, the smoke run
loads the production bundle and calls your hook against a fake form context
on both modern and legacy Xrm mocks.

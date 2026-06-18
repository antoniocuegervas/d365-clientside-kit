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
- Validation UI without raw Xrm (N-07): `LibraryUtils.setFieldNotification` /
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

## 4. Verify

Add assertions to `tests/smoke/clienthooks.smoke.test.ts`, the smoke run
loads the production bundle and calls your hook against a fake form context
on both modern and legacy Xrm mocks.

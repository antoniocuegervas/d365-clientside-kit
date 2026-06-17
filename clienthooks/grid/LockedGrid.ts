import { FormContextUtils } from "../../shared/utils/FormContextUtils";
import { ClientHook } from "../shared/ClientHook";

/**
 * OOTB editable-grid hook example: the LockedGrid pattern, register
 * on an editable grid's OnRecordSelect to make every column read-only from
 * script (e.g. rows the user may inspect but not edit).
 *
 *   Event: OnRecordSelect ("pass execution context" checked)
 *   Function: CrmClientSide.LockedGrid.onRecordSelect
 *
 * Reusable across entities, hence the non-entity registry key.
 */
export class LockedGrid extends ClientHook {
  readonly onRecordSelect = (executionContext: Xrm.Events.EventContext): void => {
    // The selected grid row's context exposes the same attribute/control
    // surface as a form context, LibraryUtils works on both.
    const rowContext = LockedGrid.formContextOf(executionContext);
    FormContextUtils.lockAllFields(rowContext);
  };
}

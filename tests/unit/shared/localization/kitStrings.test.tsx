import * as React from "react";
import { render, screen } from "@testing-library/react";
import {
  configureKitStrings,
  defaultKitStrings,
  kitStrings,
  registerKitStrings,
  setKitStringsLanguage,
  type IKitStrings,
} from "../../../../shared/localization/kitStrings";
import { spanishKitStrings } from "../../../../shared/localization/strings.es";
import { dutchKitStrings } from "../../../../shared/localization/strings.nl";
import { Stepper, type IStepperStep } from "../../../../shared/controls/presentational/Stepper";
import { DataGrid, type IGridColumn } from "../../../../shared/controls/presentational/DataGrid";
import { Observable } from "../../../../shared/reactivity/Observable";
import { resolveCounterparties } from "../../../../shared/features/counterparty/counterparty";
import type { IViewModelContext } from "../../../../shared/context/IViewModelContext";

// kitStrings is a module singleton, so every test that moves the language or the
// overrides restores English + empty overrides here, leaving nothing behind for
// another suite in the same worker.
afterEach(() => {
  configureKitStrings({});
  setKitStringsLanguage("en");
});

describe("kitStrings language machinery", () => {
  it("resolves an LCID to the built-in language (es, nl, en)", () => {
    setKitStringsLanguage(3082); // es-ES
    expect(kitStrings().newLabel).toBe("Nuevo");
    expect(kitStrings().pageNOfM(1, 3)).toBe("Página 1 de 3");

    setKitStringsLanguage(1043); // nl-NL
    expect(kitStrings().newLabel).toBe("Nieuw");
    expect(kitStrings().pageNOfM(2, 5)).toBe("Pagina 2 van 5");

    setKitStringsLanguage(1033); // en-US
    expect(kitStrings().newLabel).toBe("New");
  });

  it("falls back to English for an unknown LCID or tag", () => {
    setKitStringsLanguage(1036); // fr-FR, not a built-in
    expect(kitStrings().newLabel).toBe("New");

    setKitStringsLanguage("de"); // unregistered tag
    expect(kitStrings().newLabel).toBe("New");
  });

  it("resolves a tag through its base subtag ('es-ES', 'nl')", () => {
    setKitStringsLanguage("es-ES");
    expect(kitStrings().newLabel).toBe("Nuevo");

    setKitStringsLanguage("nl");
    expect(kitStrings().newLabel).toBe("Nieuw");
  });

  it("layers configureKitStrings overrides over the active language, either order", () => {
    // Override first, then switch language: the override survives and the rest
    // of the strings come from the active table.
    configureKitStrings({ newLabel: "Custom New" });
    setKitStringsLanguage("es");
    expect(kitStrings().newLabel).toBe("Custom New");
    expect(kitStrings().back).toBe("Atrás");

    // Switch language first, then override: same result.
    setKitStringsLanguage("nl");
    configureKitStrings({ newLabel: "Custom New" });
    expect(kitStrings().newLabel).toBe("Custom New");
    expect(kitStrings().back).toBe("Terug");
  });

  it("configureKitStrings({}) with no prior overrides leaves the language table intact", () => {
    setKitStringsLanguage("es");
    configureKitStrings({});
    expect(kitStrings().newLabel).toBe("Nuevo");
  });

  it("registers a consumer language and selects it by tag", () => {
    const french: IKitStrings = { ...defaultKitStrings, newLabel: "Nouveau", back: "Retour" };
    registerKitStrings("fr", french);
    setKitStringsLanguage("fr-FR");
    expect(kitStrings().newLabel).toBe("Nouveau");
    expect(kitStrings().back).toBe("Retour");
  });
});

describe("kitStrings table completeness", () => {
  // The compiler already enforces that es/nl are full IKitStrings; this guards
  // the runtime shape too, so a key added to the interface with an English-only
  // fallback cannot slip through as undefined via object spread.
  it("es and nl carry every key the English default carries", () => {
    for (const key of Object.keys(defaultKitStrings)) {
      expect(Object.prototype.hasOwnProperty.call(spanishKitStrings, key)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(dutchKitStrings, key)).toBe(true);
    }
  });
});

describe("kitStrings folded into controls", () => {
  it("Stepper renders the localized Back and Next labels", () => {
    setKitStringsLanguage("es");
    const steps: IStepperStep[] = [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ];
    render(
      <Stepper
        steps={steps}
        currentIndex={new Observable<number>(0)}
        canAdvance={new Observable<boolean>(true)}
        onBack={() => undefined}
        onNext={() => undefined}
        onFinish={() => undefined}
      />
    );
    expect(screen.getByText("Atrás")).toBeTruthy();
    expect(screen.getByText("Siguiente")).toBeTruthy();
  });

  it("DataGrid renders the localized empty message", () => {
    setKitStringsLanguage("es");
    const columns: IGridColumn[] = [{ key: "name", name: "Name" }];
    render(<DataGrid columns={columns} rows={[]} />);
    expect(screen.getByText("No hay datos disponibles")).toBeTruthy();
  });
});

describe("counterparty summary localization", () => {
  // One activity with two external parties: the lead plus a "(+N more)" count,
  // the composition the fold routes through kitStrings().moreParties.
  const activityId = "aaaaaaaa-0000-0000-0000-000000000001";
  const makeContext = (): IViewModelContext =>
    ({
      webAPI: {
        fetch: async () => ({
          entities: [
            {
              _activityid_value: activityId,
              _partyid_value: "11110000-0000-0000-0000-000000000001",
              "_partyid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "account",
              "_partyid_value@OData.Community.Display.V1.FormattedValue": "Acme Corp",
              participationtypemask: 2,
              "participationtypemask@OData.Community.Display.V1.FormattedValue": "To Recipient",
            },
            {
              _activityid_value: activityId,
              _partyid_value: "22220000-0000-0000-0000-000000000002",
              "_partyid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "contact",
              "_partyid_value@OData.Community.Display.V1.FormattedValue": "Beta Holdings",
              participationtypemask: 3,
              "participationtypemask@OData.Community.Display.V1.FormattedValue": "CC Recipient",
            },
          ],
        }),
      },
    }) as unknown as IViewModelContext;

  it("emits 'name (+N more)' in English by default", async () => {
    const result = await resolveCounterparties(makeContext(), [activityId]);
    expect(result.get(activityId)?.counterparty).toBe("Acme Corp (+1 more)");
  });

  it("localizes the (+N more) count with the active language", async () => {
    setKitStringsLanguage("es");
    const result = await resolveCounterparties(makeContext(), [activityId]);
    expect(result.get(activityId)?.counterparty).toBe("Acme Corp (+1 más)");
  });
});

import { EntityReference } from "../../../../shared/utils/EntityModel";
import { LibraryUtils } from "../../../../shared/utils/LibraryUtils";

describe("LibraryUtils.entitySetName", () => {
  it.each([
    ["account", "accounts"],
    ["contact", "contacts"],
    ["opportunity", "opportunities"],
    ["activitypointer", "activitypointers"],
    ["systemuser", "systemusers"],
    ["territory", "territories"],
    ["phonecall", "phonecalls"],
    ["queueitemdetach", "queueitemdetaches"], // -ch ending
    ["savedquery", "savedqueries"],
    ["businessunit", "businessunits"],
    ["postfollows", "postfollowses"], // -s ending gets -es per Dataverse convention
  ])("%s -> %s", (logical, expected) => {
    expect(LibraryUtils.entitySetName(logical)).toBe(expected);
  });
});

describe("LibraryUtils entity-set cache", () => {
  beforeEach(() => LibraryUtils.clearEntitySetNameCache());
  afterEach(() => LibraryUtils.clearEntitySetNameCache());

  it("a cached set name wins over the pluralization guess", () => {
    // The convention would guess "new_widgets"; metadata says otherwise.
    expect(LibraryUtils.entitySetName("new_widget")).toBe("new_widgets");
    LibraryUtils.cacheEntitySetName("new_widget", "new_widgetz");
    expect(LibraryUtils.entitySetName("new_widget")).toBe("new_widgetz");
  });

  it("matches the logical name case-insensitively", () => {
    LibraryUtils.cacheEntitySetName("New_Thing", "new_thingset");
    expect(LibraryUtils.entitySetName("new_thing")).toBe("new_thingset");
  });

  it("ignores empty mappings and clears cleanly", () => {
    LibraryUtils.cacheEntitySetName("account", "");
    expect(LibraryUtils.entitySetName("account")).toBe("accounts");
    LibraryUtils.cacheEntitySetName("account", "accountset");
    LibraryUtils.clearEntitySetNameCache();
    expect(LibraryUtils.entitySetName("account")).toBe("accounts");
  });
});

describe("LibraryUtils.escapeODataString", () => {
  it("doubles single quotes", () => {
    expect(LibraryUtils.escapeODataString("O'Brien's")).toBe("O''Brien''s");
  });
});

describe("LibraryUtils.odataBind", () => {
  it("builds the bind path from a reference", () => {
    const ref = new EntityReference("account", "{CCC00000-0000-0000-0000-000000000003}");
    expect(LibraryUtils.odataBind(ref)).toBe("/accounts(ccc00000-0000-0000-0000-000000000003)");
  });

  it("honors an explicit entity set override", () => {
    const ref = new EntityReference("custom_thing", "ccc00000-0000-0000-0000-000000000003");
    expect(LibraryUtils.odataBind(ref, "custom_thingz")).toBe(
      "/custom_thingz(ccc00000-0000-0000-0000-000000000003)"
    );
  });
});

describe("LibraryUtils.formatODataValue", () => {
  it("quotes/escapes strings, formats booleans, leaves numbers raw", () => {
    expect(LibraryUtils.formatODataValue("O'Brien")).toBe("'O''Brien'");
    expect(LibraryUtils.formatODataValue(true)).toBe("true");
    expect(LibraryUtils.formatODataValue(false)).toBe("false");
    expect(LibraryUtils.formatODataValue(42)).toBe("42");
  });
});

describe("LibraryUtils.formattedValue", () => {
  it("reads the formatted-value annotation", () => {
    const record = {
      revenue: 1000,
      "revenue@OData.Community.Display.V1.FormattedValue": "$1,000.00",
    };
    expect(LibraryUtils.formattedValue(record, "revenue")).toBe("$1,000.00");
    expect(LibraryUtils.formattedValue(record, "name")).toBeUndefined();
  });
});

describe("LibraryUtils.parseWebResourceParams", () => {
  it("reads ?app= directly", () => {
    const result = LibraryUtils.parseWebResourceParams("?app=template&theme=dark");
    expect(result.app).toBe("template");
    expect(result.query).toEqual({ app: "template", theme: "dark" });
  });

  it("reads app from a JSON data payload", () => {
    const data = encodeURIComponent(JSON.stringify({ app: "sample-company-search", accountId: "abc" }));
    const result = LibraryUtils.parseWebResourceParams(`?data=${data}`);
    expect(result.app).toBe("sample-company-search");
    expect(result.data).toEqual({ app: "sample-company-search", accountId: "abc" });
  });

  it("?app= wins over the data payload app", () => {
    const data = encodeURIComponent(JSON.stringify({ app: "from-data" }));
    const result = LibraryUtils.parseWebResourceParams(`?app=from-query&data=${data}`);
    expect(result.app).toBe("from-query");
  });

  it("handles double-encoded data (CRM behavior)", () => {
    const once = encodeURIComponent(JSON.stringify({ app: "double" }));
    const twice = encodeURIComponent(once);
    const result = LibraryUtils.parseWebResourceParams(`?data=${twice}`);
    expect(result.app).toBe("double");
  });

  it("passes plain-string data through", () => {
    const result = LibraryUtils.parseWebResourceParams("?data=hello%20world");
    expect(result.data).toBe("hello world");
    expect(result.app).toBeUndefined();
  });

  it("tolerates malformed JSON as a plain string", () => {
    const result = LibraryUtils.parseWebResourceParams("?data=%7Bnot-json");
    expect(result.data).toBe("{not-json");
  });

  it("handles a search string without leading question mark", () => {
    expect(LibraryUtils.parseWebResourceParams("app=x").app).toBe("x");
  });

  it("reads the fullPage marker from the data payload", () => {
    const data = encodeURIComponent(JSON.stringify({ app: "template", fullPage: true }));
    const result = LibraryUtils.parseWebResourceParams(`?data=${data}`);
    expect(result.fullPage).toBe(true);
  });

  it("defaults fullPage to false when the payload does not mark it", () => {
    expect(LibraryUtils.parseWebResourceParams("?app=template").fullPage).toBe(false);
    const unmarked = encodeURIComponent(JSON.stringify({ app: "template" }));
    expect(LibraryUtils.parseWebResourceParams(`?data=${unmarked}`).fullPage).toBe(false);
  });
});

describe("LibraryUtils.buildClientUIDataParam", () => {
  it("round-trips through the parser", () => {
    const data = LibraryUtils.buildClientUIDataParam("sample-merged-grid", { regionId: "123" });
    const parsed = LibraryUtils.parseWebResourceParams(`?data=${encodeURIComponent(data)}`);
    expect(parsed.app).toBe("sample-merged-grid");
    expect((parsed.data as Record<string, unknown>).regionId).toBe("123");
  });
});

describe("LibraryUtils.isNarrowViewport", () => {
  const fakeWindow = (matches: boolean | undefined, extras?: object): Window =>
    ({
      ...(matches === undefined ? {} : { matchMedia: () => ({ matches }) }),
      ...extras,
    }) as unknown as Window;

  it("is false when matchMedia is unavailable (non-browser host: tests, SSR)", () => {
    expect(LibraryUtils.isNarrowViewport(fakeWindow(undefined))).toBe(false);
  });

  it("reflects the media query match otherwise", () => {
    expect(LibraryUtils.isNarrowViewport(fakeWindow(true))).toBe(true);
    expect(LibraryUtils.isNarrowViewport(fakeWindow(false))).toBe(false);
  });

  it("measures the top window, not the calling window (ribbon handlers run in a hidden 0x0 frame)", () => {
    // A hidden ClientApiFrame is effectively 0x0, so its own media query always
    // matches; the app viewport is the top window's.
    expect(
      LibraryUtils.isNarrowViewport(fakeWindow(true, { top: fakeWindow(false) }))
    ).toBe(false);
    expect(
      LibraryUtils.isNarrowViewport(fakeWindow(false, { top: fakeWindow(true) }))
    ).toBe(true);
    // The top window drives even when the caller itself has no matchMedia.
    expect(
      LibraryUtils.isNarrowViewport(fakeWindow(undefined, { top: fakeWindow(true) }))
    ).toBe(true);
  });

  it("falls back to the caller's window when the top window is cross-origin", () => {
    // Shape 1: reading win.top itself throws.
    const throwingTopAccess = (matches: boolean): Window => {
      const win: Record<string, unknown> = { matchMedia: () => ({ matches }) };
      Object.defineProperty(win, "top", {
        get() {
          throw new Error("SecurityError: cross-origin frame access");
        },
      });
      return win as unknown as Window;
    };
    expect(LibraryUtils.isNarrowViewport(throwingTopAccess(true))).toBe(true);
    expect(LibraryUtils.isNarrowViewport(throwingTopAccess(false))).toBe(false);

    // Shape 2 (what browsers actually do): win.top returns a proxy whose
    // member access throws.
    const crossOriginProxy: Record<string, unknown> = {};
    Object.defineProperty(crossOriginProxy, "matchMedia", {
      get() {
        throw new Error("SecurityError: cross-origin frame access");
      },
    });
    expect(
      LibraryUtils.isNarrowViewport(fakeWindow(true, { top: crossOriginProxy }))
    ).toBe(true);
  });

  it("is false when neither the top window nor the caller has matchMedia", () => {
    expect(LibraryUtils.isNarrowViewport(fakeWindow(undefined, { top: {} }))).toBe(false);
  });
});

describe("LibraryUtils.trackNarrowViewport", () => {
  // A controllable MediaQueryList: flip `matches` and fire the captured change
  // listener on demand, so a test can simulate the viewport crossing 768px.
  const makeMql = (initial: boolean) => {
    let handler: (() => void) | undefined;
    const mql = {
      matches: initial,
      addEventListener: (_type: string, cb: () => void) => {
        handler = cb;
      },
      removeEventListener: (_type: string, cb: () => void) => {
        if (handler === cb) {
          handler = undefined;
        }
      },
    };
    return {
      mql,
      fire: (next: boolean) => {
        mql.matches = next;
        handler?.();
      },
      hasListener: () => handler !== undefined,
    };
  };
  const windowWith = (mql: object): Window => ({ matchMedia: () => mql }) as unknown as Window;

  it("seeds the initial value from the current match, both ways", () => {
    const yes = LibraryUtils.trackNarrowViewport(windowWith(makeMql(true).mql));
    expect(yes.narrow.value).toBe(true);
    yes.dispose();

    const no = LibraryUtils.trackNarrowViewport(windowWith(makeMql(false).mql));
    expect(no.narrow.value).toBe(false);
    no.dispose();
  });

  it("flips the Observable when the media query change fires", () => {
    const controller = makeMql(false);
    const tracker = LibraryUtils.trackNarrowViewport(windowWith(controller.mql));
    expect(tracker.narrow.value).toBe(false);
    controller.fire(true);
    expect(tracker.narrow.value).toBe(true);
    controller.fire(false);
    expect(tracker.narrow.value).toBe(false);
    tracker.dispose();
  });

  it("dispose removes the listener so later changes are ignored", () => {
    const controller = makeMql(false);
    const tracker = LibraryUtils.trackNarrowViewport(windowWith(controller.mql));
    tracker.dispose();
    expect(controller.hasListener()).toBe(false);
    controller.fire(true);
    expect(tracker.narrow.value).toBe(false);
  });

  it("is false and never throws when matchMedia is unavailable (dispose is a no-op)", () => {
    const tracker = LibraryUtils.trackNarrowViewport({} as unknown as Window);
    expect(tracker.narrow.value).toBe(false);
    expect(() => tracker.dispose()).not.toThrow();
  });

  it("uses the deprecated addListener pair when addEventListener is absent", () => {
    let handler: (() => void) | undefined;
    const mql = {
      matches: false,
      addListener: (cb: () => void) => {
        handler = cb;
      },
      removeListener: (cb: () => void) => {
        if (handler === cb) {
          handler = undefined;
        }
      },
    };
    const tracker = LibraryUtils.trackNarrowViewport(windowWith(mql));
    mql.matches = true;
    handler?.();
    expect(tracker.narrow.value).toBe(true);
    tracker.dispose();
    expect(handler).toBeUndefined();
  });
});

describe("LibraryUtils GUID / batch boundaries", () => {
  it("newGuid produces a v4-shaped GUID", () => {
    expect(LibraryUtils.newGuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("newBatchBoundary prefixes a guid with batch_", () => {
    expect(LibraryUtils.newBatchBoundary()).toMatch(/^batch_[0-9a-f-]{36}$/i);
  });
});

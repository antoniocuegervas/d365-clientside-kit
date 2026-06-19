import { teamsHighContrastTheme } from "@fluentui/react-components";
import { d365Theme, resolveKitTheme } from "../../../../shared/theme/d365Theme";

describe("resolveKitTheme", () => {
  it("returns the standard kit theme when high contrast is off or unknown", () => {
    expect(resolveKitTheme()).toBe(d365Theme);
    expect(resolveKitTheme(false)).toBe(d365Theme);
  });

  it("returns Fluent's high-contrast theme when high contrast is enabled", () => {
    expect(resolveKitTheme(true)).toBe(teamsHighContrastTheme);
  });
});

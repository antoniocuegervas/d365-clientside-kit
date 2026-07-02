import type * as React from "react";
import { teamsHighContrastTheme, webLightTheme, type Theme } from "@fluentui/react-components";

/**
 * The kit's single D365-aligned Fluent v9 theme (one theme module, no v8/v9
 * mixing).
 *
 * The refreshed Unified Interface is built on Fluent v9's own design
 * language: webLightTheme's brand ramp (#0f6cbd communication blue) and
 * neutrals ARE the refreshed model-driven look. We pin Segoe UI explicitly
 * and keep every other token stock so controls inherit future UCI refreshes
 * by upgrading Fluent rather than re-tuning custom tokens.
 *
 * Controls must consume tokens (via makeStyles/tokens), never hardcoded
 * colors.
 */
export const d365Theme: Theme = {
  ...webLightTheme,
  fontFamilyBase:
    '"Segoe UI", "Segoe UI Web (West European)", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif',
};

/**
 * Picks the kit theme for the host's accessibility settings. When the user has
 * D365 high contrast on (surfaced as `userSettings.isHighContrastEnabled`), we
 * swap in Fluent's high-contrast theme so the kit tracks the rest of UCI;
 * otherwise the standard kit theme. Dark mode is deliberately not handled:
 * model-driven UCI exposes no theme/dark signal to a webresource, so there is
 * nothing reliable to inherit. Hosts without the flag (PCF) get d365Theme.
 */
export function resolveKitTheme(isHighContrastEnabled?: boolean): Theme {
  return isHighContrastEnabled ? teamsHighContrastTheme : d365Theme;
}

/**
 * Picks the theme for a PCF root. When the model-driven "new look" is on, the
 * platform hands virtual controls its OWN current theme through the documented
 * `context.fluentDesignLanguage.tokenTheme`, which is the exact fidelity
 * source (it tracks the host page, high contrast and future refreshes
 * included), so it wins. Hosts that do not populate it get the kit default.
 * Classic org theming (the Theme entity) reaches no PCF surface and is
 * deliberately not emulated.
 */
export function resolvePcfTheme(source: {
  fluentDesignLanguage?: { tokenTheme?: Theme };
}): Theme {
  return source.fluentDesignLanguage?.tokenTheme ?? d365Theme;
}

/**
 * The FluentProvider props every PCF root must use. Besides the theme, this
 * carries the one layout rule a virtual control cannot skip: the platform
 * mounts the control's tree inside a flex container, where a plain div
 * shrinks to its content, so the provider must claim the full width the form
 * gives the control or every field renders narrower than the native ones
 * beside it. Kept here, in one place, because the width style was applied
 * per-root once before and quietly missed some of them.
 */
export function pcfProviderProps(source: { fluentDesignLanguage?: { tokenTheme?: Theme } }): {
  theme: Theme;
  style: React.CSSProperties;
} {
  return { theme: resolvePcfTheme(source), style: { width: "100%" } };
}

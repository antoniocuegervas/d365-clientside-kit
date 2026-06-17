import { webLightTheme, type Theme } from "@fluentui/react-components";

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

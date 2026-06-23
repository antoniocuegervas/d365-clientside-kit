# shared/features

Cross-surface feature modules: code shared by more than one delivery surface (a
webresource app and a PCF, say) so the logic is written once, not duplicated per
surface.

This is NOT the portable kit. The kit proper is the rest of `shared/` (`controls`,
`context`, `data`, `metadata`, `reactivity`, `theme`): generic, CRM-agnostic or
metadata-aware building blocks you would reuse in any project. The modules here are
the opposite: they are specific to a showcase scenario (the counterparty grid, for
example), and they live in `shared/` only because two surfaces consume them and a
PCF should import from `shared/`, not reach into a webresource app's folder.

Rule of thumb:
- Generic, reusable building block, no scenario knowledge: `shared/controls` (or
  `context` / `data` / `metadata` / `reactivity` / `theme`). That is the kit.
- Single-consumer glue: keep it with its consuming surface (the app or the PCF),
  inlined where apt. Do not promote it here.
- Scenario-specific but shared by two or more surfaces: here, in a feature folder.

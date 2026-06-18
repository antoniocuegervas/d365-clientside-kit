# D365 Client-Side UI Kit

A portable client-side kit for Microsoft Dynamics 365 / Dataverse, the
spiritual successor to SparkleXrm, rebuilt on **React 18 + TypeScript +
Fluent UI v9** to match the refreshed Unified Interface look.

When a requirement is 99% standard but configuration can't quite express it,
this kit is the third option between "compromise the requirement" and "spend
a week on a clunky POC": **native-looking UI with code-level control,
targeting ~1-day delivery.**

```tsx
// A View reads like a form layout, metadata does the rest.
<SmartTextField entity="account" attribute="name" value={vm.accountName} />
<SmartOptionSet entity="account" attribute="industrycode" value={vm.industry} />
<SmartViewGrid entity="account" refresh={vm.refreshGrid} onRecordSelected={vm.onSelect} />
```

## Delivery surfaces

| Folder | Surface |
|---|---|
| `shared/` | The portable kit, controls, context adapters, metadata, theme |
| `clientui/` | HTML webresource shell, one page, `?app=` registry, MVVM apps |
| `clienthooks/` | `CrmClientSide` UMD bundle for form / ribbon / grid events |
| `pcfs/` | Sample PCF controls importing `shared/` as source |

Runs against modern (v9.2+/UCI) orgs natively and CRM 8.x servers through a
legacy context adapter (modern browsers only, "legacy" means old server APIs).

## Getting started

```bash
npm ci
npm run verify        # lint + typecheck + build + tests + smoke + storybook
npm run storybook     # browse the controls with fixture data
```

Then read, in order:

1. [docs/architecture.md](docs/architecture.md), the three-layer contract
2. [docs/architectural-stance.md](docs/architectural-stance.md), why MVVM + Observables, on purpose
3. [docs/adding-a-webresource-app.md](docs/adding-a-webresource-app.md), ship your first app
4. [docs/component-catalog.md](docs/component-catalog.md) + [docs/control-configuration.md](docs/control-configuration.md)
5. [docs/prompt-friendly-development.md](docs/prompt-friendly-development.md), using coding agents with the kit

Sample apps live in `clientui/apps/` (start with `template`, then
`sample-company-search`); deploy and open `…/new_clientui.html?app=samples`
to browse them all from one webresource.

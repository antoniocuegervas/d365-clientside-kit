# Architecture Overview

A portable client-side kit for Dynamics 365 / Dataverse: one shared library
delivering native-looking (refreshed UCI / Fluent v9) UI to HTML webresources,
PCF controls, and form/ribbon/grid scripts.

```mermaid
flowchart TB
    subgraph hosts [Dynamics hosts]
        ModernWR["Modern webresource iframe (v9.2+/UCI)"]
        LegacyWR["CRM 8.x webresource"]
        PCFHost["PCF control host"]
        Scripts["Form / ribbon / grid events"]
    end

    subgraph adapters [IViewModelContext adapters]
        WRC["WebResourceContext"]
        WRC8["WebResourceContextV8 (cds-client Web API fallback)"]
        PCFC["PCFContext"]
    end

    subgraph kit [shared/, portable kit]
        Reactivity["Observable · ObservableEvent · SubscriptionTracker"]
        Smart["Smart controls (entity + attribute → metadata)"]
        Pres["Presentational controls (values in, events out)"]
        Meta["MetadataService (cached OData metadata)"]
        Cds["cds-client (XHR OData)"]
        Theme["d365Theme (single Fluent v9 module)"]
        Utils["LibraryUtils · EntityModel · queries"]
    end

    subgraph delivery [Delivery surfaces]
        ClientUI["clientui/, shell + apps (one HTML, ?app= registry)"]
        Hooks["clienthooks/, CrmClientSide UMD bundle"]
        PCFs["pcfs/, independent PCF projects"]
    end

    ModernWR --> WRC
    LegacyWR --> WRC8
    PCFHost --> PCFC
    Scripts --> Hooks
    WRC --> kit
    WRC8 --> kit
    PCFC --> kit
    kit --> ClientUI
    kit --> Hooks
    kit --> PCFs
    Smart --> Pres
    Smart --> Meta
    Meta --> Cds
```

## The three-layer contract (§5.2 of the spec, non-negotiable)

| Layer | Knows CRM? | Queries? | Role |
|-------|-----------|----------|------|
| **Presentational** | Never, no context, no entity names | Never | Native-parity UI; renders supplied Observables; raises events |
| **Smart (metadata-aware)** | Yes, via `IViewModelContext` | Metadata + standard fetches | `entity` + `attribute` in, resolved presentational child out |
| **ViewModel** | Yes | Anything, merges, multi-query pipelines | Owns Observables and app rules; binds presentational controls |

Presentational purity is enforced by an ESLint `no-restricted-imports` rule
scoped to `shared/controls/presentational/`, not by convention.

## Repository topology

```text
shared/        # the portable kit (everything above)
clientui/      # webresource shell: bootstrap.tsx + registry.ts + apps/
clienthooks/   # ClientHook base + CrmClientSide registry (UMD)
pcfs/          # one folder per PCF project (own package.json each)
tests/         # unit/ (mirrors sources) + mocks/ + smoke/ + storybook/
docs/          # this folder
deployment/    # SPKL config + publish script
```

## Boot flow (webresource)

`clientui/bootstrap.tsx` reads top to bottom: find `#container` → parse
`?app=`/`data` → poll for Xrm (visible timeout error) → auto-detect modern vs
legacy adapter → registry lookup → render app inside `FluentProvider` +
`ViewModelContextProvider` → unmount on `beforeunload`.

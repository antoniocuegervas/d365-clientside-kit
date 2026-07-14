# Deployment

Expectation-setting up front: this guide assumes you already deploy webresources to a
Dataverse org some way (SPKL here, but any webresource deployment works) and have a
model-driven app to host them. Without an org you can still run everything locally,
Storybook and the full verify gate, you just cannot see the controls on a real form.

## Artifacts

| Artifact | Webresource / target |
|---|---|
| `dist/clientui/<prefix>clientui.html` | HTML webresource, the single shell entry |
| `dist/clientui/<prefix>clientui.js` | Script webresource the shell loads |
| `dist/clienthooks/<prefix>clienthooks.js` | Library webresource for form/ribbon/grid registration |
| `pcfs/<Control>/out/controls` | PCF, packed into the kit solution by `deployment/solution` |

The publisher prefix lives in one place, `kit.config.json` at the repo root
(default `new_`). Change `publisherPrefix` there once and both the build and the
deploy use it, so the built artifact and the deployed webresource always share a
name. Never hardcode a customer prefix elsewhere in source.

## SPKL publish

SPKL is one webresource deployment tool among many; if your team already pushes
webresources another way (XrmToolBox, pac, a custom script), deploy `dist/` with
that and skip this section. The pieces the commands below assume:

- `nuget.exe` is the standalone NuGet CLI, not part of Windows or of Visual
  Studio's PATH by default. Download it from
  [nuget.org/downloads](https://www.nuget.org/downloads) (one exe, put it on
  PATH), or restore SPKL with `dotnet tool` alternatives if you prefer.
- The connection string is an XrmTooling string. A complete, working example
  for interactive OAuth against a cloud org (the common developer case, using
  Microsoft's public sample client id, which works for interactive logins):

  ```text
  AuthType=OAuth;Url=https://yourorg.crm.dynamics.com;Username=you@yourtenant.com;AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=Auto
  ```

  Swap `Url` and `Username` for your org and account; the browser prompt
  handles MFA. Service principals use
  `AuthType=ClientSecret;Url=...;ClientId=...;ClientSecret=...` instead.

```powershell
# one-time: restore spkl
nuget install spkl -OutputDirectory deployment/packages

# connection via env var (preferred for CI) …
$env:SPKL_CONNECTION = "AuthType=OAuth;Url=https://yourorg.crm.dynamics.com;Username=you@yourtenant.com;AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=Auto"
./deployment/deploy.ps1

# … or via deployment/connection.local.json (gitignored):
# { "connectionString": "<the same string>" }
```

`deploy.ps1` builds and runs `spkl.exe webresources` non-interactively, reading the
prefix from `kit.config.json` (the same file the build reads), so the built
artifacts and the deployed webresources always share a name. It renders
`spkl.template.json` into a gitignored `spkl.json` with that prefix. **Never commit**
connection strings, SPKL logs, or `connection.local.json`, .gitignore already
covers them; keep it that way.

## Hosting the shell

A webresource receives the full `Xrm` API (Web API, navigation, metadata) only
when it runs inside a model-driven app. Opening
`https://<org>/WebResources/new_clientui.html` as a top-level URL gives the page
no `Xrm` in this window or any parent frame, so the shell shows "Xrm was not
found" and stops. That is expected, the Unified Interface app shell is what
injects `Xrm`. Host the shell one of three ways:

- **Sitemap subarea (permanent nav entry):** add `new_clientui.html` as a Web
  Resource area in a model-driven app's navigation. It then loads in the app's
  content frame, where `parent.Xrm` is the real client API.
- **From a ribbon, form, or hook (in code):**
  `context.navigation.openClientUI("new_clientui.html", "<app-key>", { anyPayload })`
  opens the shell in the app context and passes the app key plus payload for you.
- **Quick test URL (no sitemap change):** inside any model-driven app, navigate to
  `…/main.aspx?appid=<app-id>&pagetype=webresource&webresourceName=new_clientui.html&data=<json>`
  where `<json>` is a URL-encoded `{"app":"<app-key>"}`. For example
  `data=%7B%22app%22%3A%22samples%22%7D` opens the samples hub. `appid` is any
  model-driven app in the org (a bare Dataverse environment ships none, so create a
  minimal one first), and the webresource need not be in that app's sitemap for
  `pagetype=webresource` to resolve.

### The Fiddler inner loop (edit webresource code without deploying)

The fastest webresource loop serves your LOCAL bundle to the LIVE org, so an
edit is a rebuild plus a browser refresh, no publish at all. Any HTTPS debug
proxy with response replacement works; with Fiddler Classic:

1. **Tools → Options → HTTPS**: enable "Capture HTTPS CONNECTs" and "Decrypt
   HTTPS traffic", and accept the root certificate prompt (the org runs over
   HTTPS, so Fiddler must be able to open it).
2. **AutoResponder tab**: check "Enable rules" AND "Unmatched requests
   passthrough" (without passthrough the rest of the org goes dark).
3. Add a rule matching the bundle by NAME, not full URL:
   `regex:(?insx).*new_clientui\.js` → the local file
   `<repo>\dist\clientui\new_clientui.js`. The artifact name is stable across
   builds on purpose (webpack.config.mjs keeps it deterministic) precisely so
   this one rule keeps matching.
4. `npm run build` (or `build:dev` for faster rebuilds), refresh the browser
   tab. The shell HTML requests the script with a `?v=<hash>` cache-buster,
   which the rule ignores (it matches the name), so the browser always asks
   and Fiddler always answers with your local file.
5. When you are done, disable the rule before judging real deployed behavior,
   and remember the HTML entry itself still comes from the org: changes to
   `clientui.html` (rare) do need a deploy.

If the replaced bundle does not seem to load, check the browser did not cache
it (DevTools → Network → Disable cache while DevTools is open) before
suspecting the rule.

### How the shell reaches Xrm (and the deprecation exposure)

By default the shell finds `Xrm` by walking ancestor frames (`parent.Xrm`),
which works everywhere today but sits on Microsoft's deprecation list with an
unannounced removal date. For a FORM-hosted shell there is a supported path:
register the clienthooks handler `CrmClientSide.KitShell.connect` on the
form's OnLoad (pass execution context; optionally the webresource control's
name as the string parameter). It pushes the form's `Xrm` and form context
into the shell through the web resource control's `getContentWindow`, the
mechanism the deprecation guidance points to, and the shell prefers that
over the walk whenever it is present.

The injection is asynchronous (getContentWindow resolves on the form's own
schedule), so a fast-booting shell can find a walked Xrm before the
injection lands. That ordering is handled: the injected form page is read
through a live source, not captured once at boot, so form access adopts the
injected form context whenever it arrives, and consumers that poll form
access (RecordReady, the samples hub's hosted-record line) resolve without
any ordering care on the registering form's side. One residual is
deliberate: the Xrm ROOT keeps whichever source resolved first. On a
same-origin form embed the walked and the injected Xrm are the same
platform object, so nothing is lost; where they would differ (a cross-origin
ancestry), the walk finds nothing and the boot simply waits for the
injection, which then wins outright.

Sitemap-hosted and quick-test-URL shells have no form to register
the hook on, so they continue to boot over the walk with no added delay;
that residual exposure is the platform's to resolve (there is no supported
alternative for a standalone webresource today), and if `parent.Xrm` is ever
removed, those hosting shapes stop booting until one exists.

The shell reads the app key from `?app=` or from the `data` JSON payload, so the
subarea and the navigateTo paths both select the right app.

## Source maps

`.map` files are generated locally for debugging but are NOT listed in
`spkl.template.json` and must not be deployed (Dataverse webresource size limits).

## Cache busting

Dataverse caches webresources aggressively, and a model-driven app serves a
stable script URL from cache forever even after a republish. The build defeats
this automatically: `clientui.html` references the bundle as
`new_clientui.js?v=<hash>`, where `<hash>` is the webpack compilation hash. A
changed bundle gets a new URL the browser and app cache must refetch, while the
webresource name itself stays stable (so ribbon/form registrations never go
stale). The token only changes when the bundle's content changes.

The practical workflow is therefore:
- redeploy (`deploy.ps1`, or `spkl webresources` on a current `dist/`), which
  publishes the new HTML and JS together;
- reload the app. The new HTML carries the new `?v=`, so the JS is refetched
  with no manual cache clearing.

If a reload still shows old HTML (the outer webresource, not the bundle), it is
the platform's own cache: publish customizations and reload once. For tight
inner-loop UI work, prefer Storybook (no live org needed) and deploy only for
metadata/integration checkpoints; that removes most publish cycles entirely. As
a last-resort fallback while testing, keep DevTools open with "Disable cache"
checked, which also bypasses the Unified Interface service worker.

## PCF controls: production build, deploy, and the platform-library floor

The field and grid PCFs (`pcfs/`) do not go through SPKL. Build a Release bundle and
import it in a solution:

- Build Release (production, minified), never `pac pcf push`, which ships a debug bundle.
  The repo carries the solution wrapper: `deployment/solution` references all five kit
  controls (and stages the shell webresources), so a dev import is
  `dotnet build deployment/solution -c Release -p:SolutionPackageType=Unmanaged` and
  `pac solution import --path deployment/solution/bin/Release/D365UIKit.zip
  --force-overwrite --publish-changes`. For your own controls, scaffold the same shape
  once with `pac solution init` plus a `pac solution add-reference` per control
  ([adding-a-pcf.md](adding-a-pcf.md) walks it).
- Bump the control version in `ControlManifest.Input.xml` on every redeploy. Reimporting
  the same version publishes, but the form keeps serving the cached previous bundle, so a
  fix looks like it did not deploy.
- The done bar for a PCF is "opened on a real model-driven form and observed rendering",
  not "compiles" or "renders in the test harness". Several failure modes only show once
  the control runs inside the real host.

### Virtual controls and the platform-library floor

Every kit PCF is a `control-type="virtual"` control: the platform hands it the host's
OWN React and Fluent at runtime, so the bundles carry neither (tens of KB each instead
of hundreds), native fidelity tracks the host automatically, and there is exactly one
focus-management (tabster) instance on the page, the host's, so the version-skew
collision that used to blank bundled controls is structurally impossible. The old
re-pin-per-wave runbook is retired with it.

Two version floors matter, and they are deliberately different numbers, both held in
`pcfs/platform-floor.json` and enforced by `npm run check:pcf-floor` (first step of
`npm run verify`):

- **The declared floor** (`platform-library` in each manifest): the version the org
  must ACCEPT at solution import. Declaring newer than the org supports fails the
  import; the runtime serves its current copy regardless, so the manifests declare
  low (React 16.14.0, Fluent 9.46.2) and receive current.
- **The API floor** (`@fluentui/react-components` in each PCF's devDependencies): the
  oldest Fluent delivery the kit's code actually works against. Every PCF compiles
  with exactly this version, so using an API the floor does not export fails the
  build; there is no hand-kept API list to drift. Raise it deliberately when the kit
  adopts a newer Fluent API, and state the supported floor in the README.

The gap between the two floors is the exposure: an org whose platform Fluent falls
between them (sovereign clouds such as GCC, GCC High, DoD, and China trail the
commercial wave) accepts the import and only shows the problem at runtime. The
platform documents no minimum for what it serves, only for what a manifest may
declare. The one control whose code reaches an above-declaration export today is the
counterparty grid (SearchBox, the reason `platform-floor.json` gives for the 9.61
floor), and its root probes for that export at render: on a behind-floor org it
states the wave requirement in place of the control instead of throwing into the
error boundary. If the API floor rises to an export another control uses, give that
control's root the same probe.

The checker also holds the rest of the virtual-control setup in place: react-dom
externalization stays switched on (`pcfReactPlatformLibraries` in featureconfig.json),
React and Fluent stay out of `dependencies`, and shared code stays clear of
React-18-only APIs (the webresource shell bundles React 18, but the PCF host serves
React 16/17, and shared code runs on both). It also walks each control's import
graph, its own sources plus every shared module it reaches, and fails on any
`@fluentui/*-compat` import the control does not declare: an undeclared one
resolves from the repo root and bundles an unpinned tabster chain while the
build stays green, which is exactly how a new control that renders a shared
date or time field would reproduce the collision the pins exist to prevent.

Two packages are not platform libraries and still ride in bundles where used: the icon
package (each control bundles just the icons it imports, aliased to one copy), and the
date and time picker compat packages (`KitDatePicker` bundles them, pins their internal
tabster chain to the host instance via `overrides`, and aliases them in
webpack.config.js; the checker enforces exactly that combination and rejects tabster
overrides anywhere else). Overlay surfaces in an embedded host render in place or with
an in-tree mount point rather than in a document-level portal, where the theme's CSS
variables do not reach; the lookup flyout, the date picker calendar, the time list, and
the grid hovercard all follow that pattern.

### Standard controls (historical note, and for consumers who bundle)

A consumer can still build a `control-type="standard"` PCF that bundles its own React
and Fluent, and everything the kit learned about that shape remains true: webpack must
dedupe React and Fluent to one copy each (a custom webpack.config.js aliasing them to
the project's node_modules), the bundled Fluent must pin `@fluentui/react-tabster` and
`tabster` to what the host's platform library resolves or a focus-managed component
blanks the control, and the pin must be re-verified every release wave. For scale: the
kit's own controls as standard builds weighed 350 to 750 KB each (tooltip 350, option
set 380, date picker 580, native lookup 610, counterparty grid 750), and each bundled
its own React and Fluent copy per control on the form. The virtual migration retired
all of that for the kit's controls; reach for standard only when a control needs a
library version the platform will not serve.

### The error boundary

Every PCF renders its control inside the shared `ErrorBoundary`
(`shared/controls/presentational/ErrorBoundary.tsx`), so a render throw (a bad prop, or a
tabster collision that slips through between re-pins) shows a neutral "could not be
displayed" message instead of a silently blank container. That message is plain markup with
no Fluent, on purpose, so it still renders when the failure is in the Fluent stack itself.

### Form budget

Virtual controls collapse the old per-form bundle budget. Measured production bundle
sizes after the migration (minified, this repo's builds): option set 7 KB, tooltip
54 KB, native lookup 78 KB, counterparty grid 82 KB, date picker 380 KB (the one
control that still bundles the date and time picker compat packages, which the
platform library does not carry). React and Fluent load once, from the platform, no
matter how many kit controls a form carries, so the old three-or-four-per-form
guidance no longer applies; the remaining per-control cost is each control's own
logic, and the date picker's compat payload is the only line worth watching.

Live datapoints (a small dev org, 2026-07, Unified Interface page-load KPI from the
`&perf=true` overlay, four warm full reloads each): the sample Contact main form
carrying four kit PCFs plus the timeline opened in 1.03 to 1.17 seconds (median
about 1.09 s) with the standard builds, every control bundling its own React and
Fluent, and in 1.24 to 1.86 seconds (median about 1.4 s) with the virtual builds
on a later day. The two sessions are not a controlled A/B (different days, org
load, and cache states; single-org, small samples), so read them as the same
conclusion twice: a form with four kit controls opens warm in roughly a second
and a half either way, and the virtual migration's wins are the ones it was made
for, the retired re-pin runbook, the collapsed bundles, and fidelity tracking the
host, not a headline load-time delta.

## ALM: shipping the controls to customers, not just trying the samples

Releases carry one managed zip, the **sample solution**, a demo exported from
a dev org (the sample app, forms, and views): it exists so someone can try
the kit on a trial org and uninstall it cleanly. Nothing from it should reach
a customer environment.

The **kit solution** (`D365UIKit`), built from the repo by
`deployment/solution` (the five PCF controls and the three shell
webresources, nothing else), is deliberately not a release download. The kit
is consumed as source, so the zip's purpose is to be built, not downloaded:
your fork produces it under its own publisher, and that build is the shape a
customer imports. Publishing a reference build would invite importing it
as-is, which pins the controls' org-global namespace against any fork later
stood up in the same org (the cross-publisher identity rule in
[adding-a-pcf.md](adding-a-pcf.md)).

### Inside the zip: what the org normally writes, and why this repo writes it instead

You can have customized Dataverse for years, imported and exported solutions
weekly, and never once looked inside one. That is normal, and it is exactly why
`deployment/solution` deserves five minutes of orientation before the commands:
the folder hand-writes things the platform otherwise writes for you invisibly.

**A solution zip is three things.** First, `solution.xml`, the manifest: the
solution's unique name and version, the publisher with its customization
prefix, and the list of components the solution claims as its own (the format
calls them root components).

Second, `customizations.xml`, the component definitions: one entry per
component recording its name, type, and id, and where its file lives in the
zip. This is what import actually walks to create or update components.

Third, the payload, the actual files: here, one folder per PCF control
(production `bundle.js` plus its manifest) and the three webresource files.

**Normally the org writes all three.** When you click export, the platform
assembles the manifest, the definitions, and the payload from what lives in
the org and hands you the finished zip; import reads the same three parts back
in. Nothing in the everyday customizer loop ever shows you the files, which is
why almost nobody knows them by sight.

**This repo writes them itself because two constraints leave no alternative.**
CI holds no org credential (a public repo does not get a dev-org secret), so
no export can happen there. And a release artifact must be buildable from the
commit that claims it, not exported from whatever state a dev org has
accumulated. Hold both, and someone other than an org must write what the org
normally writes. That someone is this folder: the payload is the repo's own
build output, and the manifest and definitions are rendered from the repo's
config at build time.

**The folder, file by file.**

| File | Committed or rendered | What it contributes to the zip |
|---|---|---|
| `D365UIKit.cdsproj` | committed | The `pac solution init` wrapper, close to the shape [adding-a-pcf.md](adding-a-pcf.md) scaffolds, referencing the five PCF projects, with two changes from that scaffold: a build target that runs `render-src.mjs` before packing, and the SolutionPackager pinned to 2.x (see below) |
| `Solution.template.xml` | committed | `solution.xml` with placeholders where identity lives: publisher, prefix, solution name, version |
| `render-src.mjs` | committed | Writes everything the rendered rows below describe |
| `src/Other/Customizations.xml` | committed | The near-empty definitions skeleton. Its empty `<WebResources />` node is load-bearing: it is the insertion point SolutionPackager fills with the staged webresource definitions, and without it the packer ships the files but registers no component, so an import would create nothing |
| `src/Other/Relationships.xml` | committed | Empty, part of the expected source shape |
| `src/Other/Solution.xml` | rendered, gitignored | The manifest, `Solution.template.xml` filled in from `kit.config.json` (publisher, prefix, names) and `package.json` (version) |
| `src/WebResources/*` | rendered, gitignored | The three shell webresources copied from `dist/`, each beside a small `.data.xml` carrying its component definition (name, type, id) |
| `bin/`, `obj/` | build output, gitignored | `bin/Release/D365UIKit.zip` is the artifact |

Why the webresources need staging at all: `pac solution add-reference` wires a
PCF project into the wrapper, and the build then compiles it and writes its
component entry with no further help. There is no equivalent command for loose
webresource files, so `render-src.mjs` plays the role the org would play at
export: it copies the built files in and writes each one's definition.

**The packer must be a 2.x SolutionPackager.** The
`Microsoft.PowerApps.MSBuild.Solution` reference in the cdsproj is pinned to 2.x
on purpose: it is the SolutionPackager the pac CLI ships, the same one this
kit's lifecycle already uses to export, unpack, and import. The retired 1.x line
still installs and packs the kit's controls and webresources without complaint,
but when it packs from unpacked source it silently drops component types it does
not recognize. An AI Builder prompt (`msdyn_aimodel`) is the case that caught a
product built on the kit: the 1.x packer wrote the zip with only a `Following
root components are not defined in customizations: Type='AIModel'` warning, no
error, and the prompt was simply missing from the result. A 2.x packer packs the
same source correctly.

The kit ships no AI model, so its own zip is fine under either packer; this
matters for a fork that adds one. A prompt, like any component the platform
keeps in its own file instead of inline in customizations.xml, stages the way
the webresources do: customizations.xml needs the matching childless node as the
insertion point (`<AIModels />` for a prompt), and the component's own file has
to be staged beside it. One trap: `pac solution unpack` writes the prompt as
`aimodel.yml`, and SolutionPackager does not read the `.yml` back when it packs.
It wants `aimodel.xml`. Stage the `.xml` (the way `render-src.mjs` stages the
webresource files) or the prompt drops out again with the same quiet warning.

**What each moving part buys.**

- **A reproducible release zip.** The wrapper plus the renderer build the zip
  from the commit alone, in CI, with no org in the loop.
- **A fork ships under its own publisher by editing `kit.config.json` alone.**
  The template is rendered from the same file that names the built artifacts,
  so the webresource names, the registered control names, and the solution
  publisher follow one value with no second edit.
- **A rebuilt zip UPDATES a prior import instead of colliding.** Component ids
  derive from component names, so they are identical on every rebuild, which
  is what lets a v1.3 import upgrade a v1.2 install.
- **Controls promote separately from app customizations.** The zip carries
  only the controls and the shell; the forms and views that bind them belong
  in your app solution (the fork guidance below), or in the demo sample
  solution.

### Building the kit solution from the repo

The project needs nothing beyond the repo toolchain (Node plus the .NET SDK),
and in particular no org connection and no secrets:

```powershell
npm ci                                         # once, fresh workspace
npm run build                                  # webresource artifacts into dist/
dotnet build deployment/solution -c Release    # managed zip in deployment/solution/bin/Release/D365UIKit.zip
```

`dotnet build` compiles each referenced PCF in Release (production bundles by
construction), renders the manifest and stages the webresources as the tour
above describes, and packs the zip. `SolutionPackageType` defaults to
`Managed`; pass `-p:SolutionPackageType=Unmanaged` for the dev-import variant
(the PCF section above). CI's Package stage runs exactly these commands and
publishes the zip as the `managed-solution` artifact.

Verify a release zip before shipping it: import the managed zip on an org that
is **clean for this zip**, exercise a control on a form and the shell in an
app, then uninstall and confirm it removes cleanly. Clean is three checks, not
a feeling:

- **no custom control shares the kit controls' namespace, under ANY
  publisher.** Custom-control identity is the unprefixed
  `namespace.constructor` pair (`D365Kit.*` here) and it is org-global: the
  platform rejects the import of a control that exists under another
  publisher ("already created by another publisher", observed live). The
  prefix decorates the registered name; it does not make controls from two
  publishers a disjoint set. An org that ever took the kit's PCFs, under any
  prefix, fails this check while they remain.
- **no components carry the zip's publisher prefix.** Webresources are
  genuinely prefix-scoped, so an org running the kit under a different
  publisher passes this one.
- **no solution already uses the zip's unique name**, managed or unmanaged.
  Solution unique names are org-global too, and a managed import cannot layer
  over an unmanaged solution with the same name. The SPKL deploy target
  defaults to the same `D365UIKit` name the zip carries (one `solutionName`
  in `kit.config.json` drives both), so any org that ever took the dev deploy
  with defaults already owns the name.

In practice: a fresh trial org passes all three; an org already running the
kit fails the first check no matter whose publisher it runs under.

If the only org available fails the first check because it already runs the
kit (the kit's own dev org does), the machinery can still be verified end to
end with a **verification-only build**: temporarily give the five control
manifests a throwaway namespace, rebuild the zip, then import, exercise, and
uninstall that. Revert the manifests and discard that zip afterwards, it must
never ship; the namespace string is the only thing it changes, so the result
carries to the real artifact. The kit's own v1.2.0 release was verified
exactly this way (import, a control committing values on a live form, the
shell booting the samples hub, and a first-try clean uninstall that put the
org back on its exact baseline).

### Owning the ALM in a fork

When your fork goes to a real customer, own the ALM like any other Dataverse
code component:

- **Your solution, your publisher.** Set `publisherPrefix` (and optionally
  `solutionName`, `publisherName`, `optionValuePrefix`) once in `kit.config.json`;
  the build and the solution packaging read the same file, so the webresources,
  the registered control names, and the solution publisher all follow. Nothing
  from the sample solution should reach a customer environment.
- **Two solutions when forms are involved.** Keep the kit artifacts
  (webresources, PCF controls) in their own solution, exactly what
  `deployment/solution` packs, separate from the app customizations that
  reference them (the forms and views a PCF is bound to). Controls then promote
  independently of form changes, and the import order is always controls first,
  then the app solution that depends on them.
- **Unmanaged in dev, managed everywhere else.** Iterate against dev with the
  unmanaged build (or SPKL for webresources alone), and promote the managed zip
  through test to prod. The managed artifact builds from source here, so
  promotion means "import the zip this commit builds", not "export whatever dev
  accumulated". Never hand-edit customizations in test or prod.
- **Version on every promotion.** Bump `package.json` (the solution version
  follows it) and each changed PCF's `<control version>` in its manifest (the
  cache rule above applies in every environment, not just dev; the kit's own
  controls carry the kit release version since 1.2.0). The shell webresource
  needs no rename: the cache-busted HTML entry handles it.
- **Uninstall behavior.** A managed uninstall removes the webresources and
  controls, but only after nothing references them: forms still binding a kit
  PCF block the uninstall as dependencies. Remove the bindings (or uninstall
  the dependent app solution) first, then the controls solution. Try the order
  once in test before you rely on it in prod.
- **Metadata is cached per session.** The kit caches metadata reads (labels,
  option sets, view layouts) for the life of the page, so a user with an open
  session keeps seeing pre-promotion metadata until they reload. That is not a
  failed deployment. Where an app needs to pick changes up in place, call
  `context.metadata.clearCache()` and re-run its loads; and remember the form
  definition itself has its own client-side cache (the IndexedDB note in
  gotchas).

### What the version number means (versioning policy)

Until the kit publishes a package, the repo version is a release milestone
marker, not a semver API contract. The kit is consumed source-first, through
template copies that pull nothing automatically, so there are no
version-range consumers for a major bump to protect; the one machine-read
version, the solution version, only needs to increase for updates to apply.
What a breaking change obligates is disclosure, whatever the number says: the
release notes carry a prominent breaking-changes section and the decision log
records the change and its reasoning. Strict semver begins where machine
consumption begins: a published package (the roadmap holds a direction for
packaging the presentational tier) versions its own line under real semver
from its first release.

The repo's own pipeline (below) covers the build, verify, and package half of
this; the import promotion half lives with your fork, since it is bound to
your environments and connections.

## CI

`azure-pipelines.yml` runs two stages, neither holding any org credential:

- **Verify** (ubuntu) mirrors the local gate (floor check → lint → typecheck →
  build → unit → smoke → storybook) plus conditional production PCF builds when
  `shared/`, `pcfs/`, or the root dependencies changed, and publishes `dist/`
  as the `webresources` artifact.
- **Package** (windows, where the PowerApps MSBuild targets are exercised and
  the artifact matches a local Release build) rebuilds `dist/` and runs
  `dotnet build deployment/solution -c Release`, publishing the managed zip as
  the `managed-solution` artifact. Importing it anywhere stays a human step
  with human credentials, on purpose.

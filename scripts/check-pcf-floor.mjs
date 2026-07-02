/**
 * Verifies every PCF against the shared platform-library floor
 * (pcfs/platform-floor.json), so a new or copied PCF cannot ship without the
 * setup that keeps a virtual control rendering on a real form:
 *
 * - control-type="virtual" with the manifest declaring EXACTLY the shared
 *   platform-library versions (the versions the org must accept at import).
 * - featureconfig.json with pcfReactPlatformLibraries "on" (react-dom only
 *   externalizes behind this flag; without it the bundle drags the repo
 *   root's React copy in and the control breaks).
 * - React and Fluent in devDependencies ONLY, at the shared floor versions:
 *   nothing bundles them, and compiling against the Fluent API floor is what
 *   keeps the kit off APIs an older target org might not serve.
 * - Any @fluentui/*-compat dependency (the pickers the platform library does
 *   not carry) must pin the tabster chain via overrides and alias the compat
 *   packages in webpack.config.js; without compat dependencies the project
 *   must carry no tabster overrides at all.
 * - shared/ must stay clear of React-18-only APIs: the webresource shell
 *   bundles React 18, but the PCF host serves React 16/17, and shared code
 *   runs on both.
 * - Every dependency an exact version, no ranges (installs must reproduce
 *   the tested tree).
 *
 * Run via `npm run verify` (or directly: node scripts/check-pcf-floor.mjs).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pcfsDir = path.join(root, "pcfs");
const floor = JSON.parse(readFileSync(path.join(pcfsDir, "platform-floor.json"), "utf8"));

const failures = [];
const checked = [];
const exactVersion = /^\d+\.\d+\.\d+$/;

//#region Per-PCF checks

for (const name of readdirSync(pcfsDir)) {
  // Skip local deploy wrappers (_*) and anything that is not a PCF project.
  if (name.startsWith("_") || name.startsWith(".")) {
    continue;
  }
  const dir = path.join(pcfsDir, name);
  if (!statSync(dir).isDirectory()) {
    continue;
  }
  const packagePath = path.join(dir, "package.json");
  if (!existsSync(packagePath)) {
    continue;
  }
  checked.push(name);
  const fail = (message) => failures.push(`${name}: ${message}`);

  const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
  const deps = manifest.dependencies ?? {};
  const devDeps = manifest.devDependencies ?? {};

  // The control manifest: virtual, declaring exactly the shared versions.
  const manifestPath = path.join(dir, name, "ControlManifest.Input.xml");
  if (!existsSync(manifestPath)) {
    fail(`no ControlManifest.Input.xml under ${name}/${name}/`);
  } else {
    const xml = readFileSync(manifestPath, "utf8");
    const controlType = xml.match(/control-type="([^"]+)"/)?.[1];
    if (controlType !== "virtual") {
      fail(
        `control-type is "${controlType ?? "missing"}"; kit PCFs are virtual controls ` +
          `(platform-provided React and Fluent)`
      );
    }
    const declared = {};
    for (const m of xml.matchAll(/<platform-library\s+name="([^"]+)"\s+version="([^"]+)"/g)) {
      declared[m[1]] = m[2];
    }
    for (const [lib, version] of Object.entries(floor.declaredPlatformLibraries)) {
      if (declared[lib] !== version) {
        fail(
          `manifest platform-library ${lib} is "${declared[lib] ?? "missing"}", ` +
            `the shared declaration is "${version}" (pcfs/platform-floor.json)`
        );
      }
    }
  }

  // featureconfig: react-dom externalizes only behind this flag.
  const featurePath = path.join(dir, "featureconfig.json");
  const features = existsSync(featurePath) ? JSON.parse(readFileSync(featurePath, "utf8")) : {};
  if (features.pcfReactPlatformLibraries !== "on") {
    fail(
      `featureconfig.json must set pcfReactPlatformLibraries to "on"; without it the ` +
        `bundle carries its own react-dom and the control breaks on the form`
    );
  }

  // React and Fluent: dev-time only, at the shared floor versions.
  for (const pkg of ["react", "react-dom", "@fluentui/react-components"]) {
    if (deps[pkg]) {
      fail(`${pkg} is in dependencies; a virtual control gets it from the platform, move it to devDependencies`);
    }
  }
  if (devDeps.react !== floor.reactDevVersion) {
    fail(`devDependencies.react is "${devDeps.react ?? "missing"}", the floor is "${floor.reactDevVersion}"`);
  }
  if (devDeps["react-dom"] !== floor.reactDevVersion) {
    fail(`devDependencies.react-dom is "${devDeps["react-dom"] ?? "missing"}", the floor is "${floor.reactDevVersion}"`);
  }
  if (devDeps["@fluentui/react-components"] !== floor.fluentApiFloor) {
    fail(
      `devDependencies.@fluentui/react-components is "${devDeps["@fluentui/react-components"] ?? "missing"}", ` +
        `the kit API floor is "${floor.fluentApiFloor}" (pcfs/platform-floor.json)`
    );
  }

  // Compat packages: bundled, so their tabster chain must match the host.
  const compatDeps = Object.keys(deps).filter((pkg) => /^@fluentui\/.+-compat$/.test(pkg));
  const overrides = manifest.overrides ?? {};
  if (compatDeps.length > 0) {
    for (const [pkg, version] of Object.entries(floor.compatTabsterPins)) {
      if (overrides[pkg] !== version) {
        fail(
          `bundles ${compatDeps.join(", ")} but overrides.${pkg} is ` +
            `"${overrides[pkg] ?? "missing"}", the pin is "${version}"; without it the bundled ` +
            `focus-management chain drifts from the host's shared instance and the control blanks`
        );
      }
    }
    const webpackPath = path.join(dir, "webpack.config.js");
    const webpackSource = existsSync(webpackPath) ? readFileSync(webpackPath, "utf8") : "";
    for (const pkg of compatDeps) {
      if (!webpackSource.includes(pkg)) {
        fail(
          `declares ${pkg} but webpack.config.js does not alias it; the shared source would ` +
            `resolve it from the repo root and drag an unpinned tabster into the bundle`
        );
      }
    }
    if (features.pcfAllowCustomWebpack !== "on") {
      fail(`bundles compat packages but featureconfig.json does not enable pcfAllowCustomWebpack`);
    }
  } else {
    for (const pkg of Object.keys(floor.compatTabsterPins)) {
      if (overrides[pkg]) {
        fail(
          `carries an override for ${pkg} but bundles no compat package; a virtual control ` +
            `without compat dependencies bundles no tabster, remove the override`
        );
      }
    }
  }

  // Reproducible installs: exact versions only.
  for (const [section, entries] of [
    ["dependencies", deps],
    ["devDependencies", devDeps],
  ]) {
    for (const [pkg, version] of Object.entries(entries)) {
      if (!exactVersion.test(version)) {
        fail(`${section}.${pkg} is "${version}"; every version must be exact, no ranges`);
      }
    }
  }
}

//#endregion

//#region shared/ React floor scan

// The PCF host serves React 16/17; the shell bundles React 18. Shared code
// runs on both, so APIs that only exist on 18 must stay out of shared/.
const react18Only = [
  "react-dom/client",
  "createRoot",
  "hydrateRoot",
  "useSyncExternalStore",
  "useTransition",
  "useDeferredValue",
  "startTransition",
  "useId",
  "flushSync",
  "useInsertionEffect",
];
const react18Pattern = new RegExp(
  react18Only.map((api) => (api.includes("/") ? api.replace("/", "\\/") : `\\b${api}\\b`)).join("|")
);

function scanShared(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      scanShared(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) {
      continue;
    }
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((line, index) => {
      const match = line.match(react18Pattern);
      if (match) {
        failures.push(
          `shared/${path.relative(path.join(root, "shared"), full).replaceAll("\\", "/")}:${index + 1}: ` +
            `"${match[0]}" only exists on React 18; shared code also runs on the React 16/17 PCF host`
        );
      }
    });
  }
}
scanShared(path.join(root, "shared"));

//#endregion

if (failures.length > 0) {
  console.error("PCF platform-floor check FAILED:\n");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error("\nThe floor values live in pcfs/platform-floor.json; docs/deployment.md explains them.");
  process.exit(1);
}

console.log(
  `PCF platform-floor check OK: ${checked.length} virtual PCFs on declared Fluent ` +
    `${floor.declaredPlatformLibraries.Fluent} / API floor ${floor.fluentApiFloor} ` +
    `(${checked.join(", ")}), shared/ clear of React-18-only APIs.`
);

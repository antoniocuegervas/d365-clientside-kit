/**
 * Verifies every PCF against the shared Fluent pin (pcfs/fluent-pins.json), so
 * a new or copied PCF cannot ship without the production fixes that keep a
 * control rendering on a real form:
 *
 * - @fluentui/react-components at exactly the pinned version (the host's
 *   platform-library floor), on every Fluent PCF.
 * - The tabster overrides at exactly the pinned versions, unless the control
 *   is listed tabster-free (then they must be absent, that absence is the
 *   point of the tabster-free tier).
 * - webpack.config.js and featureconfig.json present (the React/Fluent dedupe;
 *   without them the bundle carries two React copies and blanks on a form).
 * - Every declared @fluentui/*-compat package aliased in webpack.config.js
 *   (otherwise it resolves from the repo root and drags an unpinned tabster
 *   into the bundle; see docs/gotchas.md).
 * - Every dependency an exact version, no ranges (installs must reproduce the
 *   tested tree).
 *
 * Run via `npm run verify` (or directly: node scripts/check-pcf-pins.mjs).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pcfsDir = path.join(root, "pcfs");
const pins = JSON.parse(readFileSync(path.join(pcfsDir, "fluent-pins.json"), "utf8"));
const pinnedFluent = pins["@fluentui/react-components"];
const pinnedOverrides = pins.overrides;
const tabsterFree = new Set(pins.tabsterFree ?? []);

const failures = [];
const checked = [];

const exactVersion = /^\d+\.\d+\.\d+$/;

for (const name of readdirSync(pcfsDir)) {
  // Skip local deploy wrappers (_*) and anything that is not a PCF project.
  if (name.startsWith("_") || name.startsWith(".")) {
    continue;
  }
  const dir = path.join(pcfsDir, name);
  if (!statSync(dir).isDirectory()) {
    continue;
  }
  const manifestPath = path.join(dir, "package.json");
  if (!existsSync(manifestPath)) {
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const deps = manifest.dependencies ?? {};
  if (!deps["@fluentui/react-components"]) {
    continue; // not a Fluent PCF, nothing to enforce
  }
  checked.push(name);
  const fail = (message) => failures.push(`${name}: ${message}`);

  if (deps["@fluentui/react-components"] !== pinnedFluent) {
    fail(
      `@fluentui/react-components is "${deps["@fluentui/react-components"]}", ` +
        `the pin is "${pinnedFluent}" (pcfs/fluent-pins.json)`
    );
  }

  const overrides = manifest.overrides ?? {};
  if (tabsterFree.has(name)) {
    for (const pkg of Object.keys(pinnedOverrides)) {
      if (overrides[pkg]) {
        fail(
          `is listed tabster-free but carries an override for ${pkg}; ` +
            `remove it, or remove the control from tabsterFree in pcfs/fluent-pins.json`
        );
      }
    }
  } else {
    for (const [pkg, version] of Object.entries(pinnedOverrides)) {
      if (overrides[pkg] !== version) {
        fail(
          `overrides.${pkg} is "${overrides[pkg] ?? "missing"}", the pin is "${version}"; ` +
            `without it the bundle floats to a tabster the host cannot share and the control ` +
            `blanks on a form`
        );
      }
    }
  }

  for (const file of ["webpack.config.js", "featureconfig.json"]) {
    if (!existsSync(path.join(dir, file))) {
      fail(`${file} is missing; without the React/Fluent dedupe the control blanks on a form`);
    }
  }

  const webpackPath = path.join(dir, "webpack.config.js");
  const webpackSource = existsSync(webpackPath) ? readFileSync(webpackPath, "utf8") : "";
  for (const pkg of Object.keys(deps)) {
    if (/^@fluentui\/.+-compat$/.test(pkg) && !webpackSource.includes(pkg)) {
      fail(
        `declares ${pkg} but webpack.config.js does not alias it; it will resolve from the ` +
          `repo root and drag an unpinned tabster into the bundle (see docs/gotchas.md)`
      );
    }
  }

  for (const [section, entries] of [
    ["dependencies", deps],
    ["devDependencies", manifest.devDependencies ?? {}],
  ]) {
    for (const [pkg, version] of Object.entries(entries)) {
      if (!exactVersion.test(version)) {
        fail(`${section}.${pkg} is "${version}"; every version must be exact, no ranges`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("PCF pin check FAILED:\n");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error(
    "\nThe pin values live in pcfs/fluent-pins.json; the re-pin runbook is in docs/deployment.md."
  );
  process.exit(1);
}

console.log(
  `PCF pin check OK: ${checked.length} Fluent PCFs match the pin ` +
    `(${checked.join(", ")}; tabster-free: ${[...tabsterFree].join(", ") || "none"}).`
);

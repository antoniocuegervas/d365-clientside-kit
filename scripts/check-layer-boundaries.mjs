/**
 * Verifies the presentational layer boundary by RESOLUTION, not by string
 * match, closing a hole the lint rule cannot see.
 *
 * eslint.config.mjs enforces the same boundary with no-restricted-imports,
 * which matches the import SPECIFIER STRING. That misses spellings that reach a
 * forbidden tier without naming it: from shared/controls/presentational/, the
 * sibling import "../smart/X" resolves into shared/controls/smart/ but its
 * specifier carries no "controls" segment, so the controls/smart pattern
 * never fired. This check resolves every relative import from every
 * presentational file to a real source file and fails if the resolution lands
 * in a CRM-aware tier, whatever the specifier looks like.
 *
 * Scope: direct imports of the presentational files themselves (the same
 * contract the lint rule states, made resolution-based). Because it visits
 * every file under the presentational roots, a presentational-tier helper's own
 * forbidden import is caught too. It does NOT chase re-exports through an
 * intermediary that sits outside the presentational tree; no such barrel exists
 * in the kit, and Storybook rendering every presentational control with zero
 * mocks is the deeper net for that class. The Xrm-global half of the boundary
 * stays with eslint's no-restricted-globals (it is not import-based).
 *
 * Run via `npm run verify` (or directly: node scripts/check-layer-boundaries.mjs).
 * Set KIT_LAYER_BOUNDARY_ROOT to point the scan at a fixture tree (tests do).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.KIT_LAYER_BOUNDARY_ROOT
  ? path.resolve(process.env.KIT_LAYER_BOUNDARY_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharedDir = path.join(root, "shared");

// The presentational scan roots, mirroring eslint.config.mjs `files`.
const presentationalRoots = [
  path.join(sharedDir, "controls", "presentational"),
  path.join(sharedDir, "components", "presentational"),
];

// Forbidden resolution targets, mirroring the eslint.config.mjs
// no-restricted-imports groups: a presentational file may not import anything
// that resolves into these CRM-aware tiers.
const forbiddenDirs = [
  path.join(sharedDir, "context"),
  path.join(sharedDir, "metadata"),
  path.join(sharedDir, "data"),
  path.join(sharedDir, "queries"),
  path.join(sharedDir, "controls", "smart"),
];

const importSpec = /(?:^|\n)\s*(import|export)\s+([^;]*?from\s+)?["']([^"']+)["']/g;
const failures = [];
let scanned = 0;

/** Resolves a relative import specifier to a source file, TypeScript style. */
function resolveModule(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    base,
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return undefined;
}

function isUnder(file, dir) {
  return file === dir || file.startsWith(dir + path.sep);
}

/** The LibraryUtils file (the lint's LibraryUtils pattern) or any forbidden dir. */
function forbiddenTier(resolved) {
  if (path.basename(resolved).startsWith("LibraryUtils")) {
    return "LibraryUtils";
  }
  for (const dir of forbiddenDirs) {
    if (isUnder(resolved, dir)) {
      return path.relative(sharedDir, dir).replaceAll("\\", "/");
    }
  }
  return undefined;
}

function checkFile(file) {
  scanned += 1;
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(importSpec)) {
    const spec = match[3];
    if (!spec.startsWith(".")) {
      // Bare specifiers (react, @fluentui/*) are never the kit's CRM tiers;
      // there are no path aliases, so every intra-kit import is relative.
      continue;
    }
    const resolved = resolveModule(file, spec);
    if (!resolved) {
      continue;
    }
    const tier = forbiddenTier(resolved);
    if (tier) {
      const relFile = path.relative(root, file).replaceAll("\\", "/");
      const relResolved = path.relative(root, resolved).replaceAll("\\", "/");
      failures.push(
        `${relFile} imports "${spec}" (resolves to ${relResolved}), the ${tier} tier; ` +
          `presentational controls take values and events only`
      );
    }
  }
}

function scan(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      scan(full);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) {
      checkFile(full);
    }
  }
}

for (const dir of presentationalRoots) {
  if (existsSync(dir)) {
    scan(dir);
  }
}

if (failures.length > 0) {
  console.error("Presentational layer-boundary check FAILED:\n");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error(
    "\nMove the CRM access to a smart control or ViewModel (docs/architecture.md)."
  );
  process.exit(1);
}

console.log(
  `Presentational layer-boundary check OK: ${scanned} presentational files, ` +
    `none resolve into the context/metadata/data/queries/LibraryUtils/smart tiers.`
);

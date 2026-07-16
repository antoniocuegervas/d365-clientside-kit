/**
 * bundle-size-report.mjs, strictly read-only.
 *
 * Walks the kit's three artifact locations and prints name, size in KB, the
 * recorded expectation, and a flag. Never writes anything; exit code 1 only
 * when a SUSPECT flag fired (so it can gate), 0 otherwise.
 *
 * Locations:
 *   dist/clientui + dist/clienthooks   (webresource bundles, npm run build)
 *   pcfs/<Name>/out/controls/<Ctl>/bundle.js   (PCF builds; _* dirs skipped,
 *                                               same rule as check-pcf-floor.mjs)
 *   deployment/solution/bin/Release/*.zip      (dotnet build -c Release)
 *
 * Expectation sources:
 *   PCF bands: docs/deployment.md "Form budget" (production builds measured
 *   after the virtual-control migration): option set 7 KB, tooltip 54 KB,
 *   native lookup 78 KB, counterparty grid 82 KB, date picker 380 KB (the one
 *   control bundling the date/time compat packages).
 *   Shell: the decision log's recorded numbers, full ten-app shell 889 KB,
 *   trimmed (template + samples hub only) 425 KB.
 *   clienthooks and the solution zip carry no doc-recorded band; the
 *   references below were measured in 2026-07.
 *
 * Flag semantics:
 *   [OK]      within 1.25x of the recorded/reference number
 *   [GROWN]   above 1.25x of recorded, below the bundling threshold; explain
 *             the growth before shipping (measure, then decide)
 *   [SUSPECT] a non-compat PCF at 150 KB+ or any PCF at 500 KB+ almost
 *             certainly bundled React/Fluent (virtual posture broken; run
 *             node scripts/check-pcf-floor.mjs), or clienthooks at 150 KB+
 *             (React leaked into the hooks bundle)
 *   [INFO]    no band recorded, size and build date printed for the record
 *   [MISSING] not built; the line says which build produces it
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This file lives at skills/d365kit-diagnostics-and-tooling/scripts/, three
// directories below the repo root.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// Recorded production sizes in KB (docs/deployment.md, Form budget).
const recordedPcf = {
  KitOptionSet: 7,
  KitTooltip: 54,
  KitNativeLookup: 78,
  KitCounterpartyGrid: 82,
  KitDatePicker: 380,
};
const SHELL_FULL_KB = 889; // recorded, full ten-app shell
const SHELL_TRIMMED_KB = 425; // recorded, template + samples hub only
const HOOKS_REF_KB = 45; // measured 2026-07, no doc band
const ZIP_REF_KB = 450; // measured 2026-07, no doc band

let suspectCount = 0;
const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const day = (stat) => stat.mtime.toISOString().slice(0, 10);
const line = (flag, name, sizeKb, note) => {
  if (flag === "SUSPECT") suspectCount += 1;
  const size = sizeKb === undefined ? "" : `${sizeKb} KB`.padStart(11);
  console.log(`  [${flag.padEnd(7)}] ${name.padEnd(44)}${size}  ${note}`);
};

//#region Webresource bundles (dist/)

console.log("Webresource bundles (dist/, from npm run build):");
const distDir = path.join(root, "dist");
if (!existsSync(distDir)) {
  line("MISSING", "dist/", undefined, "not built; run npm run build");
} else {
  for (const sub of ["clientui", "clienthooks"]) {
    const dir = path.join(distDir, sub);
    if (!existsSync(dir)) {
      line("MISSING", `dist/${sub}/`, undefined, "not built; run npm run build");
      continue;
    }
    const bundles = readdirSync(dir).filter((f) => f.endsWith(".js"));
    if (bundles.length === 0) {
      line("MISSING", `dist/${sub}/`, undefined, "no .js bundle; run npm run build");
    }
    for (const file of bundles) {
      const stat = statSync(path.join(dir, file));
      const size = kb(stat.size);
      if (sub === "clientui") {
        let flag = "OK";
        let note = `full ten-app shell recorded ${SHELL_FULL_KB} KB, trimmed ${SHELL_TRIMMED_KB} KB; built ${day(stat)}`;
        if (size > SHELL_FULL_KB * 1.25) {
          flag = "GROWN";
          note = `above 1.25x the recorded full-shell ${SHELL_FULL_KB} KB; explain the growth (new app? new Fluent surface?); built ${day(stat)}`;
        } else if (size < SHELL_TRIMMED_KB * 0.7) {
          flag = "INFO";
          note = `well under the trimmed ${SHELL_TRIMMED_KB} KB; is the app manifest trimmed on purpose?; built ${day(stat)}`;
        }
        line(flag, `dist/${sub}/${file}`, size, note);
      } else {
        let flag = size > 150 ? "SUSPECT" : size > HOOKS_REF_KB * 1.25 ? "GROWN" : "OK";
        const note =
          flag === "SUSPECT"
            ? `hooks bundle should carry no React/Fluent; reference ${HOOKS_REF_KB} KB; built ${day(stat)}`
            : `reference ${HOOKS_REF_KB} KB (no doc band); built ${day(stat)}`;
        line(flag, `dist/${sub}/${file}`, size, note);
      }
    }
  }
}

//#endregion

//#region PCF bundles (pcfs/*/out/)

console.log("\nPCF bundles (pcfs/*/out/, from each PCF build or dotnet Release):");
const pcfsDir = path.join(root, "pcfs");
if (!existsSync(pcfsDir)) {
  line("MISSING", "pcfs/", undefined, "no pcfs/ directory in this checkout");
} else {
  for (const name of readdirSync(pcfsDir)) {
    // Same skip rule as scripts/check-pcf-floor.mjs: _* local wrappers and dotfiles.
    if (name.startsWith("_") || name.startsWith(".")) continue;
    const dir = path.join(pcfsDir, name);
    if (!statSync(dir).isDirectory() || !existsSync(path.join(dir, "package.json"))) continue;

    // Does this control bundle compat packages (date/time pickers)? Those
    // legitimately weigh hundreds of KB; everything else must stay small.
    const manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
    const hasCompat = Object.keys(manifest.dependencies ?? {}).some((p) =>
      /^@fluentui\/.+-compat$/.test(p)
    );

    const controlsDir = path.join(dir, "out", "controls");
    if (!existsSync(controlsDir)) {
      line(
        "MISSING",
        `pcfs/${name}`,
        undefined,
        "not built; run the PCF build (npm run build inside the folder, or dotnet build deployment/solution -c Release)"
      );
      continue;
    }
    for (const ctl of readdirSync(controlsDir)) {
      const bundle = path.join(controlsDir, ctl, "bundle.js");
      if (!existsSync(bundle)) continue;
      const stat = statSync(bundle);
      const size = kb(stat.size);
      const expected = recordedPcf[name];
      const suspectAt = hasCompat ? 500 : 150;
      let flag;
      let note;
      if (size >= suspectAt) {
        flag = "SUSPECT";
        note = `a virtual control this size has almost certainly bundled React/Fluent; run node scripts/check-pcf-floor.mjs; built ${day(stat)}`;
      } else if (expected !== undefined) {
        flag = size <= expected * 1.25 ? "OK" : "GROWN";
        note =
          flag === "OK"
            ? `recorded ${expected} KB (docs/deployment.md form budget); built ${day(stat)}`
            : `above 1.25x the recorded ${expected} KB (docs/deployment.md); explain the growth; built ${day(stat)}`;
      } else {
        flag = size > 100 ? "GROWN" : "OK";
        note = `no recorded band (new control?); virtual controls sit at 7-82 KB, compat bundlers near 380 KB; built ${day(stat)}`;
      }
      line(flag, `pcfs/${name} (${ctl})`, size, note);
    }
  }
}

//#endregion

//#region Solution zip (deployment/solution/bin/Release/)

console.log("\nSolution zip (deployment/solution/bin/Release/, from dotnet build -c Release):");
const releaseDir = path.join(root, "deployment", "solution", "bin", "Release");
if (!existsSync(releaseDir)) {
  line("MISSING", "deployment/solution/bin/Release/", undefined, "not built; run npm run build then dotnet build deployment/solution -c Release");
} else {
  const zips = readdirSync(releaseDir).filter((f) => f.endsWith(".zip"));
  if (zips.length === 0) {
    line("MISSING", "deployment/solution/bin/Release/", undefined, "no zip; run dotnet build deployment/solution -c Release");
  }
  for (const file of zips) {
    const stat = statSync(path.join(releaseDir, file));
    line(
      "INFO",
      `deployment/solution/bin/Release/${file}`,
      kb(stat.size),
      `reference ${ZIP_REF_KB} KB (no doc band); built ${day(stat)}, rebuild before judging`
    );
  }
}

//#endregion

console.log(
  suspectCount > 0
    ? `\n${suspectCount} SUSPECT flag(s). A virtual control or the hooks bundle grew past its bundling threshold; treat as a defect until explained.`
    : "\nNo SUSPECT flags. GROWN lines still deserve one sentence of explanation in the PR or decision entry."
);
process.exit(suspectCount > 0 ? 1 : 0);

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// scripts/check-layer-boundaries.mjs resolves every relative import from every
// presentational file and fails if it lands in a CRM-aware tier, catching the
// spellings the string-matching lint rule misses (the sibling "../smart/X").
// These tests drive the real script over throwaway fixture trees via
// KIT_LAYER_BOUNDARY_ROOT, plus one run against the live repo tree.

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const script = path.join(repoRoot, "scripts", "check-layer-boundaries.mjs");

const created: string[] = [];

afterAll(() => {
  for (const dir of created) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Lays down a fixture tree from a {relativePath: contents} map, returns its root. */
function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "kit-boundary-"));
  created.push(dir);
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return dir;
}

function runChecker(root: string): { status: number; output: string } {
  const run = spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, KIT_LAYER_BOUNDARY_ROOT: root },
  });
  return { status: run.status ?? -1, output: `${run.stdout}${run.stderr}` };
}

describe("check-layer-boundaries.mjs", () => {
  it("passes a clean presentational tree", () => {
    const root = fixture({
      "shared/reactivity/Observable.ts": "export class Observable {}",
      "shared/controls/presentational/helper.ts": "export const helper = 1;",
      "shared/controls/presentational/Clean.tsx":
        `import { Observable } from "../../reactivity/Observable";\n` +
        `import { helper } from "./helper";\n` +
        `export const x = [Observable, helper];\n`,
    });
    const { status, output } = runChecker(root);
    expect(status).toBe(0);
    expect(output).toContain("OK");
  });

  it("catches the sibling ../smart spelling the lint pattern misses", () => {
    const root = fixture({
      "shared/controls/smart/SmartThing.ts": "export const SmartThing = 1;",
      "shared/controls/presentational/Bad.tsx":
        `import { SmartThing } from "../smart/SmartThing";\nexport const x = SmartThing;\n`,
    });
    const { status, output } = runChecker(root);
    expect(status).toBe(1);
    expect(output).toContain("Bad.tsx");
    expect(output).toContain("controls/smart");
  });

  it("catches every forbidden tier, whatever the spelling", () => {
    const root = fixture({
      "shared/context/Ctx.ts": "export const Ctx = 1;",
      "shared/metadata/Meta.ts": "export const Meta = 1;",
      "shared/data/Data.ts": "export const Data = 1;",
      "shared/queries/Query.ts": "export const Query = 1;",
      "shared/utils/LibraryUtils.ts": "export const LibraryUtils = 1;",
      "shared/controls/smart/Smart.ts": "export const Smart = 1;",
      "shared/controls/presentational/Reaches.tsx":
        `import { Ctx } from "../../context/Ctx";\n` +
        `import { Meta } from "../../metadata/Meta";\n` +
        `import { Data } from "../../data/Data";\n` +
        `import { Query } from "../../queries/Query";\n` +
        `import { LibraryUtils } from "../../utils/LibraryUtils";\n` +
        `import { Smart } from "../smart/Smart";\n` +
        `export const x = [Ctx, Meta, Data, Query, LibraryUtils, Smart];\n`,
    });
    const { status, output } = runChecker(root);
    expect(status).toBe(1);
    for (const tier of ["context", "metadata", "data", "queries", "LibraryUtils", "controls/smart"]) {
      expect(output).toContain(tier);
    }
  });

  it("scans the components/presentational root too", () => {
    const root = fixture({
      "shared/context/Ctx.ts": "export const Ctx = 1;",
      "shared/components/presentational/Comp.tsx":
        `import { Ctx } from "../../context/Ctx";\nexport const x = Ctx;\n`,
    });
    const { status, output } = runChecker(root);
    expect(status).toBe(1);
    expect(output).toContain("Comp.tsx");
  });

  it("catches a type-only import (a smart type is still a layer violation)", () => {
    const root = fixture({
      "shared/controls/smart/Smart.ts": "export type Smart = number;",
      "shared/controls/presentational/TypeOnly.tsx":
        `import type { Smart } from "../smart/Smart";\nexport type X = Smart;\n`,
    });
    const { status } = runChecker(root);
    expect(status).toBe(1);
  });

  it("passes against the current repository tree", () => {
    const run = spawnSync(process.execPath, [script], { cwd: repoRoot, encoding: "utf8" });
    expect(run.status).toBe(0);
  });
});

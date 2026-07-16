import { spawnSync } from "node:child_process";
import path from "node:path";

// The presentational purity rule lives in eslint.config.mjs as a
// no-restricted-imports pattern group. no-restricted-imports matches the
// import SPECIFIER STRING, so the sibling spelling "../smart/X" (which has no
// "controls" segment) used to slip past the "**/controls/smart/**" pattern
// while the "../../controls/smart/X" spelling was caught. These tests lint
// real specifiers through the actual config (the eslint binary over stdin, so
// the real flat config is loaded exactly as the gate loads it) and assert the
// sibling spelling stays covered.

const repoRoot = path.resolve(__dirname, "..", "..");
const eslintBin = path.join(repoRoot, "node_modules", "eslint", "bin", "eslint.js");

/** Lints a snippet as if it were the given file, returning only the layer-rule messages. */
function boundaryMessages(relativeFilePath: string, code: string): string[] {
  const run = spawnSync(
    process.execPath,
    [eslintBin, "--stdin", "--stdin-filename", relativeFilePath, "--format", "json"],
    { input: code, cwd: repoRoot, encoding: "utf8" }
  );
  if (!run.stdout) {
    throw new Error(`eslint produced no output. stderr:\n${run.stderr}`);
  }
  const results = JSON.parse(run.stdout) as Array<{
    messages: Array<{ ruleId: string | null; message: string }>;
  }>;
  return results
    .flatMap((r) => r.messages)
    .filter((m) => m.ruleId === "no-restricted-imports")
    .map((m) => m.message);
}

const PRESENTATIONAL = "shared/controls/presentational/__boundaryProbe.tsx";

describe("presentational layer boundary (eslint.config.mjs)", () => {
  it("flags the sibling ../smart spelling (the bypass)", () => {
    const messages = boundaryMessages(
      PRESENTATIONAL,
      `import { SmartTextField } from "../smart/SmartTextField";\nexport const probe = SmartTextField;\n`
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it("flags the ../../controls/smart spelling", () => {
    const messages = boundaryMessages(
      PRESENTATIONAL,
      `import { SmartTextField } from "../../controls/smart/SmartTextField";\nexport const probe = SmartTextField;\n`
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it("leaves a clean reactivity import alone", () => {
    const messages = boundaryMessages(
      PRESENTATIONAL,
      `import { Observable } from "../../reactivity/Observable";\nexport const probe = Observable;\n`
    );
    expect(messages).toEqual([]);
  });

  it("does not apply the rule outside the presentational tier", () => {
    const messages = boundaryMessages(
      "shared/controls/smart/__boundaryProbe.tsx",
      `import { SmartTextField } from "../smart/SmartTextField";\nexport const probe = SmartTextField;\n`
    );
    expect(messages).toEqual([]);
  });
});

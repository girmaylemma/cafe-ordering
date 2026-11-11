#!/usr/bin/env node
/**
 * `npm test`: runs Vitest, then FAILS if fewer test files ran than exist in test/.
 *
 * Why: three times a run silently reported fewer tests (e.g. 252 instead of 279) and still exited
 * green; once a planted bug went unnoticed that way. Until the cause is found, a missing file must
 * turn the run red instead of hiding a failure. Extra arguments go to Vitest; the file count is
 * only checked for full runs (no arguments).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const report = join(tmpdir(), `cafe-vitest-${process.pid}.json`);

const run = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "--reporter=default", "--reporter=json", `--outputFile.json=${report}`, ...args],
  { stdio: "inherit" },
);
if (run.status !== 0) process.exit(run.status ?? 1);

if (args.length === 0) {
  const expected = readdirSync("test").filter((f) => f.endsWith(".test.ts")).length;
  const ran = existsSync(report) ? JSON.parse(readFileSync(report, "utf8")).testResults.length : 0;
  rmSync(report, { force: true });
  if (ran !== expected) {
    console.error(`\n✗ Only ${ran} of ${expected} test files ran. Treat this run as FAILED and run again; report it if it repeats.`);
    process.exit(1);
  }
  console.log(`✓ All ${expected} test files ran.`);
}
rmSync(report, { force: true });

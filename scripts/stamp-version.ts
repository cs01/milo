// Stamps the current commit into src/version.ts so a released binary can report
// which commit built it. Run in CI immediately before `bun build --compile`;
// the edit is never committed.
//
// Written as a bun script rather than `sed -i` because the release matrix builds
// on both macOS and Linux runners, and their seds disagree about -i.

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const path = new URL("../src/version.ts", import.meta.url).pathname;

const sha =
  process.env.GITHUB_SHA?.slice(0, 7) ??
  execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();

const src = readFileSync(path, "utf8");
const stamped = src.replace(
  /^export const MILO_BUILD = "dev";$/m,
  `export const MILO_BUILD = ${JSON.stringify(sha)};`
);

if (stamped === src) {
  console.error("stamp-version: MILO_BUILD line not found in src/version.ts");
  process.exit(1);
}

writeFileSync(path, stamped);
console.log(`stamped MILO_BUILD = ${sha}`);

// Stamps the current commit into src/version.ts so a released binary can report
// which commit built it. Run in CI immediately before `bun build --compile`;
// the edit is never committed.
//
// Written as a bun script rather than `sed -i` because the release matrix builds
// on both macOS and Linux runners, and their seds disagree about -i.

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { releaseVersion } from "./release-meta";

const path = new URL("../src/version.ts", import.meta.url).pathname;

const sha =
  process.env.GITHUB_SHA?.slice(0, 7) ??
  execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();

const src = readFileSync(path, "utf8");
let stamped = src.replace(
  /^export const MILO_BUILD = "dev";$/m,
  `export const MILO_BUILD = ${JSON.stringify(sha)};`
);

if (stamped === src) {
  console.error("stamp-version: MILO_BUILD line not found in src/version.ts");
  process.exit(1);
}

// On a tag build the tag is the version of record, so `milo --version` matches the
// release, the Homebrew formula, and the npm package. The checked-in MILO_VERSION is
// what a dev build reports and what the NEXT tag is expected to be; a mismatch means
// someone tagged without bumping it, which would ship two different version strings.
const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : undefined;
if (tag) {
  const version = releaseVersion(tag);
  const current = /^export const MILO_VERSION = "([^"]+)";$/m.exec(src)?.[1];
  if (current !== version) {
    console.error(
      `stamp-version: tag ${tag} is version ${version}, but src/version.ts says ${current}. ` +
        `Bump MILO_VERSION and re-tag.`
    );
    process.exit(1);
  }
}

writeFileSync(path, stamped);
console.log(`stamped MILO_BUILD = ${sha}${tag ? ` (tag ${tag})` : ""}`);

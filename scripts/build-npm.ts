// Builds the npm packages for a release out of the tarballs the build matrix already
// produced. Layout is the esbuild/swc one: a tiny `@milo-lang/cli` wrapper whose
// optionalDependencies are four per-platform packages, each carrying one binary and
// gated by npm's `os`/`cpu` fields. npm installs exactly the one that matches, so the
// wrapper stays a few KB instead of shipping every platform to everyone.
//
//   bun scripts/build-npm.ts <version> <artifacts-dir> <out-dir>
//
// <artifacts-dir> holds milo-<target>.tar.gz for every entry in TARGETS.

import { execFileSync } from "child_process";
import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { NPM_SCOPE, REPO, TARGETS } from "./release-meta";

const [version, artifacts, out] = process.argv.slice(2);
if (!version || !artifacts || !out) {
  console.error("usage: build-npm.ts <version> <artifacts-dir> <out-dir>");
  process.exit(1);
}

const REPO_URL = `https://github.com/${REPO}`;
const common = {
  version,
  license: "MIT",
  homepage: "https://milo-language.github.io/milo/",
  repository: { type: "git", url: `git+${REPO_URL}.git` },
};

rmSync(out, { recursive: true, force: true });

for (const t of TARGETS) {
  const dir = join(out, t.target);
  mkdirSync(join(dir, "bin"), { recursive: true });

  // The tarball wraps the binary in a milo-<target>/ directory (see release.yml — a
  // flat archive is hostile to anyone extracting it by hand), so unpack and lift it out.
  execFileSync("tar", ["xzf", join(artifacts, `milo-${t.target}.tar.gz`), "-C", dir]);
  renameSync(join(dir, `milo-${t.target}`, "milo"), join(dir, "bin", "milo"));
  rmSync(join(dir, `milo-${t.target}`), { recursive: true, force: true });
  chmodSync(join(dir, "bin", "milo"), 0o755);

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: `${NPM_SCOPE}/${t.target}`,
        description: `Milo compiler binary for ${t.target}`,
        ...common,
        os: [t.os],
        cpu: [t.cpu],
        // Without this npm drops the executable bit and the wrapper's spawn EACCESes.
        files: ["bin/milo"],
      },
      null,
      2
    ) + "\n"
  );
}

const cli = join(out, "cli");
mkdirSync(join(cli, "bin"), { recursive: true });

// Resolve the platform package rather than guessing a path: npm may hoist it to a
// parent node_modules, and pnpm puts it somewhere else entirely.
writeFileSync(
  join(cli, "bin", "milo.js"),
  `#!/usr/bin/env node
// Locates the platform-specific Milo binary and hands the process over to it.
const { spawnSync } = require("child_process");

const pkg = \`${NPM_SCOPE}/\${process.platform}-\${process.arch}\`;

let binary;
try {
  binary = require.resolve(\`\${pkg}/bin/milo\`);
} catch {
  console.error(
    \`milo: no prebuilt binary for \${process.platform}-\${process.arch}.\\n\` +
      "Supported: ${TARGETS.map(t => `${t.os}-${t.cpu}`).join(", ")}.\\n" +
      "If your platform is on that list, the optional dependency failed to install — " +
      "reinstall with optional dependencies enabled."
  );
  process.exit(1);
}

// stdio: "inherit" keeps the compiler's TTY behaviour (colour, the LSP's stdio
// transport). Signals are forwarded by the shell, so no manual relay is needed.
const r = spawnSync(binary, process.argv.slice(2), { stdio: "inherit" });
if (r.error) {
  console.error(\`milo: \${r.error.message}\`);
  process.exit(1);
}
process.exit(r.status === null ? 1 : r.status);
`
);
chmodSync(join(cli, "bin", "milo.js"), 0o755);

writeFileSync(
  join(cli, "package.json"),
  JSON.stringify(
    {
      name: `${NPM_SCOPE}/cli`,
      description: "Milo — a memory-safe systems language that compiles to LLVM IR",
      ...common,
      keywords: ["milo", "compiler", "systems", "llvm", "memory-safety"],
      bin: { milo: "bin/milo.js" },
      files: ["bin/milo.js"],
      optionalDependencies: Object.fromEntries(
        TARGETS.map(t => [`${NPM_SCOPE}/${t.target}`, version])
      ),
    },
    null,
    2
  ) + "\n"
);

writeFileSync(
  join(cli, "README.md"),
  `# Milo

A memory-safe systems language that compiles to LLVM IR — Rust's guarantees without
lifetime annotations.

\`\`\`sh
npm install -g ${NPM_SCOPE}/cli
milo --version
\`\`\`

This package downloads nothing at install time: the binary for your platform arrives
as an optional dependency and npm skips the other three.

Docs, language tour, and an in-browser playground: <https://milo-language.github.io/milo/>
`
);

console.log(`built npm packages for ${version} in ${out}/`);
for (const t of TARGETS) console.log(`  ${NPM_SCOPE}/${t.target}`);
console.log(`  ${NPM_SCOPE}/cli`);

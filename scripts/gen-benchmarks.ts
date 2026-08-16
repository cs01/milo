// Renders the benchmark table in benchmarks/README.md and the docs-site chart data
// from benchmarks/results.json, the one place the numbers live.
//
// Run:  bun run scripts/gen-benchmarks.ts               # rewrite both targets
//       bun run scripts/gen-benchmarks.ts --check       # fail if either is stale (CI/test)
//       bun run scripts/gen-benchmarks.ts --from-results # adopt the last ./benchmarks/run.sh
//
// The same ten rows were transcribed by hand into three places — hyperfine's
// results-*.md, the README table, and the `benchmarks` array in BenchmarkChart.vue —
// and they had already diverged: results-fib.md measured milo at 17.4 ms against a
// published 20.8 ms. A number a human retypes is a number that goes stale, and this one
// is the front page of the docs site.
//
// --from-results is deliberately a separate, explicit step: results-*.md accumulate
// across partial runs on whatever machine last ran them, so adopting them is a claim
// ("I just measured all of these, here"), not a refresh.
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const SOURCE = join(ROOT, "benchmarks", "results.json");
const README = join(ROOT, "benchmarks", "README.md");
const CHART = join(ROOT, "docs", "site", ".vitepress", "theme", "BenchmarkChart.vue");

interface Row { stem: string; name: string; c: number; milo: number; go: number; cNote?: string }

const data = JSON.parse(readFileSync(SOURCE, "utf-8")) as { benchmarks: Row[] };

function fromResults(): void {
  for (const row of data.benchmarks) {
    const path = join(ROOT, "benchmarks", `results-${row.stem}.md`);
    if (!existsSync(path)) { console.warn(`no results-${row.stem}.md — keeping the published number`); continue; }
    const text = readFileSync(path, "utf-8");
    // hyperfine picks the unit per run: the startup benchmark exports µs, everything
    // else ms. Reading the number without the header would publish 858 ms for a 0.9 ms
    // startup.
    const toMs = /Mean \[µs\]/.test(text) ? 0.001 : 1;
    for (const lang of ["milo", "c", "go"] as const) {
      // hyperfine's markdown row: | `milo` | 17.4 ± 1.6 | 15.4 | 19.2 | 1.03 ± 0.15 |
      // The label may carry a parenthesised qualifier (`c (yyjson)`); it may NOT carry a
      // bare suffix — `milo mmap` in the grep run is a different program, not this row.
      const m = new RegExp(`^\\|\\s*\`${lang}(?: \\([^)]*\\))?\`\\s*\\|\\s*([0-9.]+)`, "m").exec(text);
      if (!m) throw new Error(`results-${row.stem}.md has no '${lang}' row`);
      row[lang] = Math.round(parseFloat(m[1]!) * toMs * 10) / 10;
    }
  }
  writeFileSync(SOURCE, JSON.stringify(data, null, 2) + "\n");
  console.log(`updated ${SOURCE} from benchmarks/results-*.md`);
}

const ratio = (r: Row) => r.milo / r.c;
const fmt = (n: number) => `${n.toFixed(1)} ms`;

function table(): string {
  const rows = data.benchmarks.map(r => {
    // Bold marks "at or faster than C" — the claim the page is making.
    const rel = ratio(r);
    const relText = `${rel.toFixed(2)}x`;
    return `| ${r.name.padEnd(22)} | ${(fmt(r.c) + (r.cNote ?? "")).padEnd(7)} | ${fmt(r.milo).padEnd(7)} | ${fmt(r.go).padEnd(7)} | ${(rel <= 1.0 ? `**${relText}**` : relText).padEnd(9)} |`;
  });
  return [
    "| Benchmark              | C       | Milo    | Go      | Milo vs C |",
    "|------------------------|---------|---------|---------|-----------|",
    ...rows,
  ].join("\n");
}

function chartArray(): string {
  const rows = data.benchmarks.map(r => {
    const note = r.cNote ? `, cNote: '${r.cNote}'` : "";
    // One decimal always: the template renders `{{ b.milo }}ms`, so a bare 12 would
    // print "12ms" in a column of "12.8ms".
    const n = (v: number) => v.toFixed(1);
    return `  { name: '${r.name}', c: ${n(r.c)}, milo: ${n(r.milo)}, go: ${n(r.go)}${note} },`;
  });
  return ["const benchmarks = [", ...rows, "]"].join("\n");
}

// Both targets carry the same marker pair, so a reader of either file can see the text
// is generated and where from.
function splice(path: string, open: string, close: string, body: string): [string, string] {
  const text = readFileSync(path, "utf-8");
  const i = text.indexOf(open);
  const j = text.indexOf(close, i);
  if (i < 0 || j < 0) throw new Error(`${path}: missing ${open} / ${close} markers`);
  return [text, text.slice(0, i + open.length) + "\n" + body + "\n" + text.slice(j)];
}

const targets: [string, string, string, string][] = [
  [README, "<!-- gen:benchmarks -->", "<!-- /gen:benchmarks -->", table()],
  [CHART, "// gen:benchmarks", "// /gen:benchmarks", chartArray()],
];

if (process.argv.includes("--from-results")) fromResults();

let stale = 0;
for (const [path, open, close, body] of targets) {
  const [current, next] = splice(path, open, close, body);
  if (current === next) continue;
  if (process.argv.includes("--check")) {
    console.error(`${path.slice(ROOT.length + 1)}: benchmark numbers are stale`);
    stale++;
  } else {
    writeFileSync(path, next);
    console.log(`wrote ${path.slice(ROOT.length + 1)}`);
  }
}
if (stale) {
  console.error("regenerate with: bun run scripts/gen-benchmarks.ts");
  process.exit(1);
}
if (process.argv.includes("--check")) console.log("benchmark numbers are up to date");

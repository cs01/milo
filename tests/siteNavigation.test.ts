// Static applications deployed beneath the docs base must bypass VitePress's SPA router.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const emulatorPaths = ["nes", "genesis", "snes"];

describe("emulator site navigation", () => {
  for (const page of ["index.md", "demos.md"]) {
    test(`${page} bypasses the docs router`, () => {
      const source = readFileSync(join(root, "docs", "site", page), "utf8");
      const links = [...source.matchAll(/<a\b[^>]*href="\/milo\/(nes|genesis|snes)\/"[^>]*>/g)];

      expect(links.map((match) => match[1])).toEqual(emulatorPaths);
      // target="_self" is the reliable escape hatch: VitePress only intercepts a link when
      // its target attribute is empty. data-vp-ignore is kept as a belt-and-suspenders hint.
      for (const [anchor] of links) {
        expect(anchor).toContain('target="_self"');
        expect(anchor).toContain("data-vp-ignore");
      }
    });
  }
});

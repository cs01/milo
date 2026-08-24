#!/usr/bin/env python3
# Which Rust lifetime annotations name something Milo cannot express?
#
#   python3 scripts/lifetime-census.py ~/git/axum ~/git/clap ...
#
# docs/design.md long carried "~1,200 lifetime annotations across ripgrep and deno,
# roughly 70% zero-copy views, 30% inexpressible" with no script and no corpus behind
# it, so the number could not be re-derived or widened. This is that script. Both of
# those codebases are also the same shape (scan bytes fast), which is thin support for
# a language-defining bet.
#
# The dividing line is NOT how many lifetimes appear but WHERE they sit:
#   - on a fn signature (param or return): a borrow that lives for one call.
#     Milo's second-class references cover this.
#   - on a TYPE (a struct/enum that stores a borrowed field): a borrow that outlives
#     the call. Milo cannot express this at all. This is the number that matters.
#
# Deliberately conservative. 'static is excluded (it borrows nothing). A type is counted
# once at its declaration, never per use site. impl<'a> blocks are reported but kept OUT
# of the ratio: an impl for a borrow-carrying type is the same type again, and counting
# it would inflate the inexpressible side.
#
# Limits, stated so the number is not over-read: this is line-based, so a declaration
# split across lines is missed, and a phantom lifetime is counted like a real borrow.
# It measures DECLARATIONS, which is not the same denominator as the old annotation
# count — this is a second, clearer measurement, not a refutation of the first.
import re, sys, os, collections

decl_re  = re.compile(r"^\s*(?:pub(?:\([^)]*\))?\s+)?(struct|enum|union)\s+(\w+)\s*<([^>{]*)>")
fn_re    = re.compile(r"^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?fn\s+\w+\s*(<[^>]*>)?\s*\(")
impl_re  = re.compile(r"^\s*impl\s*<([^>]*)>")
lt_re    = re.compile(r"'(?!static\b)([a-z_]\w*)")
cow_re   = re.compile(r"\bCow\s*<")

def scan(root):
    c = collections.Counter()
    types_with_lt = []
    for dirpath, dirnames, files in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ("target", ".git", "node_modules", "vendor")]
        for f in files:
            if not f.endswith(".rs"): continue
            p = os.path.join(dirpath, f)
            try: lines = open(p, errors="ignore").read().split("\n")
            except Exception: continue
            for ln in lines:
                if ln.lstrip().startswith("//"): continue
                m = decl_re.match(ln)
                if m and lt_re.search(m.group(3)):
                    c["type_carries_lifetime"] += 1
                    types_with_lt.append(f"{m.group(1)} {m.group(2)}")
                    continue
                if impl_re.match(ln) and lt_re.search(ln):
                    c["impl_block"] += 1; continue
                if fn_re.match(ln):
                    if lt_re.search(ln): c["fn_signature"] += 1
                    continue
                if cow_re.search(ln) and lt_re.search(ln):
                    c["cow"] += 1
    return c, types_with_lt

for root in sys.argv[1:]:
    name = os.path.basename(root.rstrip("/"))
    c, types = scan(root)
    fn, ty, im, cw = c["fn_signature"], c["type_carries_lifetime"], c["impl_block"], c["cow"]
    tot = fn + ty
    pct = (ty / tot * 100) if tot else 0
    print(f"{name:14} fn-sig {fn:5}  type-carries {ty:4}  impl<'a> {im:5}  Cow {cw:4}   "
          f"| {pct:5.1f}% of borrows sit on a TYPE")

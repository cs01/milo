#!/usr/bin/env python3
"""Differential-test std/toml against Python's tomllib.

Every file in tests/toml-corpus is parsed twice — once by tests/toml-corpus/dump.milo,
once by the stdlib's tomllib — and the two results are compared as *tagged* data, so
the check covers types as well as values: an untagged dump cannot tell 1 from 1.0,
and getting that wrong is exactly how a TOML parser ends up subtly non-conforming.

The driver reports two encodings per file: the direct parse, and parse → stringify →
parse. Both are held to the same oracle, so the serializer is graded too.

    python3 scripts/toml-oracle.py [--milo bun:src/main.ts] [--filter substring]

tomllib produces datetime/date/time objects where we deliberately keep the original
lexical text (see the module header in std/toml.milo). Both sides are canonicalised
to a Python temporal object using tomllib's own conversion rules — including its
truncate-to-microseconds behaviour — so the comparison stays a real one rather than
a string that always matches.
"""

import argparse
import datetime
import json
import math
import pathlib
import re
import subprocess
import sys
import tempfile
import tomllib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CORPUS = ROOT / "tests" / "toml-corpus"
INVALID = CORPUS / "invalid"
DRIVER = CORPUS / "dump.milo"

RE_FRACTION = re.compile(r"\.([0-9]+)")


def lexical_to_temporal(text):
    """A TOML datetime literal as the Python object tomllib would have built."""
    s = text
    if len(s) > 10 and s[10] in "tT ":
        s = s[:10] + "T" + s[11:]
    if s.endswith(("z", "Z")):
        s = s[:-1] + "+00:00"
    # tomllib keeps microseconds only, truncating (not rounding) anything finer.
    m = RE_FRACTION.search(s)
    if m:
        micros = m.group(1)[:6].ljust(6, "0")
        s = s[: m.start()] + "." + micros + s[m.end() :]
    if "T" in s:
        return datetime.datetime.fromisoformat(s)
    if ":" in s:
        return datetime.time.fromisoformat(s)
    return datetime.date.fromisoformat(s)


def canon(v):
    """tomllib's output in the driver's tagged encoding."""
    if isinstance(v, bool):
        return {"b": v}
    if isinstance(v, int):
        return {"i": str(v)}
    if isinstance(v, float):
        return {"f": v}
    if isinstance(v, str):
        return {"s": v}
    if isinstance(v, list):
        return {"a": [canon(x) for x in v]}
    if isinstance(v, dict):
        return {"t": {k: canon(x) for k, x in v.items()}}
    if isinstance(v, (datetime.datetime, datetime.date, datetime.time)):
        return {"dt": v}
    raise TypeError(f"unexpected reference type {type(v)!r}")


def floats_eq(a, b):
    if math.isnan(a) and math.isnan(b):
        return True
    if math.isinf(a) or math.isinf(b):
        return a == b
    return a == b or math.isclose(a, b, rel_tol=1e-15, abs_tol=0.0)


def eq(mine, ref, path="$"):
    """Compare one tagged node. Returns None on match, else a description."""
    mtag = next(iter(mine))
    rtag = next(iter(ref))
    if mtag == "d":
        if rtag != "dt":
            return f"{path}: we read a datetime, reference read {rtag}"
        try:
            got = lexical_to_temporal(mine["d"])
        except ValueError as e:
            return f"{path}: our datetime text {mine['d']!r} is not a valid literal ({e})"
        want = ref["dt"]
        if type(got) is not type(want) or got != want:
            return f"{path}: datetime {got!r} != {want!r}"
        return None
    if mtag != rtag:
        return f"{path}: type {mtag} != {rtag}"
    if mtag == "i":
        if mine["i"] != ref["i"]:
            return f"{path}: int {mine['i']} != {ref['i']}"
        return None
    if mtag == "f":
        got = float(mine["f"])
        if not floats_eq(got, ref["f"]):
            return f"{path}: float {got!r} != {ref['f']!r}"
        return None
    if mtag in ("s", "b"):
        if mine[mtag] != ref[mtag]:
            return f"{path}: {mtag} {mine[mtag]!r} != {ref[mtag]!r}"
        return None
    if mtag == "a":
        if len(mine["a"]) != len(ref["a"]):
            return f"{path}: array length {len(mine['a'])} != {len(ref['a'])}"
        for i, (x, y) in enumerate(zip(mine["a"], ref["a"])):
            bad = eq(x, y, f"{path}[{i}]")
            if bad:
                return bad
        return None
    if mtag == "t":
        mk, rk = set(mine["t"]), set(ref["t"])
        if mk != rk:
            extra = sorted(mk - rk)
            missing = sorted(rk - mk)
            return f"{path}: keys differ (extra {extra}, missing {missing})"
        for k in sorted(mk):
            bad = eq(mine["t"][k], ref["t"][k], f"{path}.{k}")
            if bad:
                return bad
        return None
    return f"{path}: unknown tag {mtag}"


def run_driver(milo_cmd, cases, out_bin):
    build = subprocess.run(
        milo_cmd + ["build", str(DRIVER), "-o", str(out_bin)],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    if build.returncode != 0:
        sys.exit(f"driver build failed:\n{build.stdout}{build.stderr}")
    run = subprocess.run(
        [str(out_bin)] + [str(c) for c in cases],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    if run.returncode != 0:
        sys.exit(f"driver run failed (exit {run.returncode}):\n{run.stdout}{run.stderr}")
    parsed = {}
    for line in run.stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        parsed[pathlib.Path(parts[0]).name] = parts[1:]
    return parsed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--milo",
        default="",
        help="compiler command; default is the checkout's own `bun run src/main.ts`",
    )
    ap.add_argument("--filter", default="", help="only run corpus files containing this substring")
    args = ap.parse_args()

    milo_cmd = args.milo.split() if args.milo else ["bun", "run", str(ROOT / "src" / "main.ts")]
    cases = sorted(p for p in CORPUS.glob("*.toml") if args.filter in p.name)
    rejects = sorted(p for p in INVALID.glob("*.toml") if args.filter in p.name)
    if not cases and not rejects:
        sys.exit(f"no corpus files under {CORPUS}")

    with tempfile.TemporaryDirectory() as tmp:
        out = run_driver(milo_cmd, cases + rejects, pathlib.Path(tmp) / "toml-dump")

    failures = 0
    for case in cases:
        fields = out.get(case.name)
        if fields is None:
            print(f"FAIL {case.name}: driver produced no output line")
            failures += 1
            continue
        if fields[0].startswith("!"):
            print(f"FAIL {case.name}: we rejected a document tomllib accepts: {fields[0][1:]}")
            failures += 1
            continue
        ref = canon(tomllib.loads(case.read_text()))
        problems = []
        for label, field in (("parse", fields[0]), ("round-trip", fields[1])):
            if field.startswith("!"):
                problems.append(f"{label}: {field[1:]}")
                continue
            bad = eq(json.loads(field), ref)
            if bad:
                problems.append(f"{label}: {bad}")
        if problems:
            failures += 1
            print(f"FAIL {case.name}")
            for p in problems:
                print(f"  {p}")
        else:
            print(f"ok   {case.name}")

    # The other half of conformance: everything under invalid/ must be rejected by
    # BOTH parsers. A parser that only agrees on well-formed input is not conforming,
    # it is lenient — and leniency is how a config typo becomes a silent wrong value.
    reject_failures = 0
    for case in rejects:
        try:
            tomllib.loads(case.read_text())
        except tomllib.TOMLDecodeError:
            pass
        else:
            reject_failures += 1
            print(f"FAIL invalid/{case.name}: tomllib accepts it, so it does not belong here")
            continue
        fields = out.get(case.name)
        if fields is None:
            reject_failures += 1
            print(f"FAIL invalid/{case.name}: driver produced no output line")
        elif not fields[0].startswith("!"):
            reject_failures += 1
            print(f"FAIL invalid/{case.name}: we accepted a document tomllib rejects")
        else:
            print(f"ok   invalid/{case.name} -> {fields[0][1:]}")

    total = len(cases) + len(rejects)
    bad = failures + reject_failures
    print(
        f"\n{len(cases) - failures}/{len(cases)} valid files match tomllib (parse + round-trip); "
        f"{len(rejects) - reject_failures}/{len(rejects)} invalid files rejected by both"
    )
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

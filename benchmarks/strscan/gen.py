#!/usr/bin/env python3
# Generate the corpus the scan benchmark reads. Deterministic, so the match count is
# stable across machines and the two programs can be checked against each other.
import random, sys
random.seed(7)
words = ["alpha", "beta", "gamma", "delta", "epsilon", "milo", "zeta", "eta", "theta", "iota"]
out = sys.argv[1] if len(sys.argv) > 1 else "corpus.txt"
n = int(sys.argv[2]) if len(sys.argv) > 2 else 1200000
with open(out, "w") as f:
    for _ in range(n):
        f.write(" ".join(random.choice(words) for _ in range(8)) + "\n")

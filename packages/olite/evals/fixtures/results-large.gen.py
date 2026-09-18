"""Generates results-large.tabular. Deterministic, so the expected counts hold."""

import random

ROWS = 120000
COUNTRIES = ["United States", "Soviet Union", "Italy", "France", "Germany", "Japan", "Kenya"]
WEIGHTS = [0.30, 0.10, 0.13, 0.12, 0.15, 0.12, 0.08]
MEDALS = ["Gold", "Silver", "Bronze", "NA", "NA", "NA"]


def build():
    rng = random.Random(918)
    out = ["athlete\tteam\tmedal\tyear\tsport"]
    for i in range(ROWS):
        team = rng.choices(COUNTRIES, WEIGHTS)[0]
        out.append(f"athlete_{i:06d}\t{team}\t{rng.choice(MEDALS)}\t{2000 + i % 20}\tsport_{i % 40}")
    return "\n".join(out) + "\n"

# Claim falsifications

One script per architectural claim, run by hand against a live Galaxy:

```
GALAXY_URL=... GALAXY_API_KEY=... python3 claims/c2_boundary.py
```

Each constructs its condition directly through the Galaxy API rather than prompting a model,
so it tests whether the assertion detects the condition instead of waiting for a mistake.
Fixture histories are named `c1 `/`c2 `/`c3 ` and are safe to delete.

The claims themselves are in `~/notes/olite/architectural-claims.md`.

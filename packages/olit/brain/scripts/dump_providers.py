"""Emit the provider registry as JSON for the picker UI.

The registry lives in providers.py; the front end must not keep its own copy or
the two drift. Run at build time, before vite bundles src/.
"""

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from olit.substrate.llm.providers import REGISTRY  # noqa: E402

out = []
for p in REGISTRY.values():
    out.append(
        {
            "id": p.id,
            "name": p.name,
            # No auth_env means the endpoint takes no user key (galaxy proxy, local server).
            "needs_key": p.auth_env is not None,
            "base_url": p.base_url,
            "models": [{"id": m.id, "context_window": m.context_window} for m in p.models.values()],
            # No bundled catalog: the endpoint's models are the user's to name.
            "free_model": p.free_model,
            # Galaxy's proxy picks its own model, so the picker offers no model field at all.
            "takes_model": p.id != "galaxy",
            # Whatever this endpoint needs beyond a bearer token, so discovery reaches it too.
            "headers": p.compat.get("headers", {}),
        }
    )

target = pathlib.Path(__file__).resolve().parents[2] / "src" / "providers.generated.json"
target.write_text(json.dumps(out, indent=2) + "\n")
print(f"wrote {target} ({len(out)} providers)")

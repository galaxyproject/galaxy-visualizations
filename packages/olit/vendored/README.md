# Vendored integrity

Some files here are copies of files owned elsewhere: Orbit's chat UI under `src/orbit/`, and
the galaxy-charts input contract under `brain/olit/vendor/`. They are synced by copy, which
works only while the copies stay byte-identical, so their hashes are pinned in a manifest.

```bash
npm run vendored       # or: python3 vendored/check.py
python3 vendored/check.py --update    # re-pin after a deliberate re-sync
```

The Orbit seam registry, which tracks what Olit's prompts and tools carry from Orbit, lives
in the `agents` repo and reads what `npm run describe` publishes.

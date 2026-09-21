"""Keep a known secret value out of the transcript.

Ported from loom `extensions/loom/secret-redaction.ts` (#183). Value-based, not
pattern-based: only the concrete keys this session holds are scrubbed, so ordinary
output is never mangled. Loom gathers from its config file and secret-valued env
vars; olite has neither, so the session config is the source.
"""

REDACTED = "[redacted]"

# Below this a "secret" is too short to scrub safely. Real API keys are far longer.
MIN_SECRET_LEN = 8

# Config keys whose value is a live credential.
SECRET_CONFIG_KEYS = ("ai_api_key", "galaxy_key")


def collect_secret_values(config):
    """The concrete strings to scrub. Pure: the config is passed in."""
    out = set()
    if config is None:
        return []
    for name in SECRET_CONFIG_KEYS:
        value = config.get(name)
        if isinstance(value, str) and len(value) >= MIN_SECRET_LEN:
            out.add(value)
    return sorted(out)


def redact_secrets(text, secrets):
    """Literal replacement, longest first so a key containing a shorter one goes whole."""
    if not isinstance(text, str) or not secrets:
        return text
    out = text
    for secret in sorted((s for s in secrets if len(s) >= MIN_SECRET_LEN), key=len, reverse=True):
        if secret in out:
            out = out.replace(secret, REDACTED)
    return out

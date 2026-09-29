"""Unicode-confusables fold for tool-name lookup, from loom's `confusables.ts`."""

# Only lookalikes observed in sampled identifiers. Keep it narrow.
CONFUSABLES = {
    # Cyrillic lowercase that look like Latin
    "а": "a",
    "е": "e",
    "о": "o",
    "р": "p",
    "с": "c",
    "х": "x",
    "у": "y",
    # Cyrillic uppercase
    "А": "A",
    "Е": "E",
    "О": "O",
    "Р": "P",
    "С": "C",
    "Х": "X",
    "У": "Y",
    # Greek lowercase
    "ν": "v",
    "τ": "t",
}


def has_confusables(text):
    return any(ch in CONFUSABLES for ch in text or "")


def fold(text):
    """Map every known lookalike to its Latin counterpart; other characters pass."""
    if not text:
        return text
    return "".join(CONFUSABLES.get(ch, ch) for ch in text)


def find_match(bad_name, candidates):
    """The candidate `bad_name` meant, or None; a pure-ASCII miss is not folded."""
    if not has_confusables(bad_name):
        return None
    folded = fold(bad_name)
    for name in candidates:
        if fold(name) == folded:
            return name
    return None

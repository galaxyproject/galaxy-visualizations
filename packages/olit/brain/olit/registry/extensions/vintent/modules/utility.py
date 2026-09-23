def user_asked_for(context, keywords):
    if not context:
        return False
    last = None
    for t in reversed(context):
        if t.get("role") == "user" and isinstance(t.get("content"), str):
            last = t.get("content").lower()
            break
    if not last:
        return False
    words = last.split()
    for w in words:
        for k in keywords:
            if len(k) <= 5:
                if w == k:
                    return True
            else:
                if _edit_distance_leq_one(w, k):
                    return True
    return False


def _edit_distance_leq_one(a, b):
    la = len(a)
    lb = len(b)
    if abs(la - lb) > 1:
        return False
    if a == b:
        return True
    if la == lb:
        diff = 0
        for i in range(la):
            if a[i] != b[i]:
                diff += 1
                if diff > 1:
                    return False
        return True
    if la + 1 == lb:
        return _one_insert_away(a, b)
    if lb + 1 == la:
        return _one_insert_away(b, a)
    return False


def _one_insert_away(shorter, longer):
    i = 0
    j = 0
    diff = 0
    while i < len(shorter) and j < len(longer):
        if shorter[i] == longer[j]:
            i += 1
            j += 1
        else:
            diff += 1
            if diff > 1:
                return False
            j += 1
    return True

"""Expression operators for agent pipelines.

Each expression operator transforms data within the agent context.
All operators receive:
- expr: The expression definition dict (contains parameters like 'from', 'args', etc.)
- ctx: The current execution context
- resolve: A function to resolve nested references/expressions
"""

import logging
from typing import Any, Callable

from .exceptions import ExpressionError
from .types import Context

logger = logging.getLogger(__name__)

# Type alias for expression definitions
ExprDict = dict[str, Any]
ResolveFunc = Callable[[Any, Context], Any]


def _type_name(value: Any) -> str:
    """Get a readable type name for error messages."""
    if value is None:
        return "null"
    return type(value).__name__


def _truncate(value: Any, max_len: int = 50) -> str:
    """Truncate a value for display in error messages."""
    s = repr(value)
    if len(s) > max_len:
        return s[: max_len - 3] + "..."
    return s


def expr_concat(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> str:
    """Concatenate multiple values into a string.

    Parameters:
        args: list of values to concatenate

    Example:
        {op: concat, args: ["Hello, ", {$ref: state.name}, "!"]}
    """
    args = expr.get("args")
    if args is None:
        raise ExpressionError(
            "Missing required parameter",
            operator="concat",
            parameter="args",
            expected="list of values",
            hint="Usage: {op: concat, args: [value1, value2, ...]}"
        )
    if not isinstance(args, list):
        raise ExpressionError(
            "Invalid parameter type",
            operator="concat",
            parameter="args",
            expected="list",
            received=_type_name(args),
        )
    resolved = [resolve(a, ctx) for a in args]
    return "".join(str(a) for a in resolved)


def expr_coalesce(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> Any:
    """Return the first non-null value from a list.

    Parameters:
        args: list of values to check

    Example:
        {op: coalesce, args: [{$ref: state.primary}, {$ref: state.fallback}, "default"]}
    """
    args = expr.get("args")
    if args is None:
        raise ExpressionError(
            "Missing required parameter",
            operator="coalesce",
            parameter="args",
            expected="list of values",
            hint="Usage: {op: coalesce, args: [value1, value2, ...]}"
        )
    if not isinstance(args, list):
        raise ExpressionError(
            "Invalid parameter type",
            operator="coalesce",
            parameter="args",
            expected="list",
            received=_type_name(args),
        )
    for a in args:
        resolved = resolve(a, ctx)
        if resolved is not None:
            return resolved
    return None


def expr_get(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> Any:
    """Get a value from an object with a default fallback.

    Parameters:
        obj: the object to get from
        key: the key to retrieve
        default: fallback value if key not found (optional)

    Example:
        {op: get, obj: {$ref: state.data}, key: "name", default: "unknown"}
    """
    obj = resolve(expr.get("obj"), ctx)
    key = resolve(expr.get("key"), ctx)
    default = resolve(expr.get("default"), ctx)

    if key is None:
        raise ExpressionError(
            "Missing required parameter",
            operator="get",
            parameter="key",
            expected="string key name",
            hint="Usage: {op: get, obj: ..., key: 'fieldName', default: ...}"
        )

    if obj is None:
        logger.debug("get: obj is null, returning default")
        return default

    if not isinstance(obj, dict):
        logger.debug("get: obj is %s (not dict), returning default", _type_name(obj))
        return default

    return obj.get(key, default)


def expr_len(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> int:
    """Get the length of a list or string.

    Parameters:
        arg: the value to measure

    Example:
        {op: len, arg: {$ref: state.items}}
    """
    # Check if parameter exists (not just if value is truthy)
    if "arg" not in expr and "from" not in expr:
        raise ExpressionError(
            "Missing required parameter",
            operator="len",
            parameter="arg",
            expected="list or string",
            hint="Usage: {op: len, arg: {$ref: state.items}}"
        )

    arg = expr.get("arg") if "arg" in expr else expr.get("from")
    obj = resolve(arg, ctx)

    if obj is None:
        return 0
    if not hasattr(obj, "__len__"):
        raise ExpressionError(
            "Cannot get length of value",
            operator="len",
            parameter="arg",
            expected="list, string, or other sized type",
            received=_type_name(obj),
        )
    return len(obj)


def expr_eq(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> bool:
    """Check if two values are equal.

    Parameters:
        left: first value
        right: second value

    Example:
        {op: eq, left: {$ref: state.status}, right: "active"}
    """
    if "left" not in expr:
        raise ExpressionError(
            "Missing required parameter",
            operator="eq",
            parameter="left",
            hint="Usage: {op: eq, left: value1, right: value2}"
        )
    if "right" not in expr:
        raise ExpressionError(
            "Missing required parameter",
            operator="eq",
            parameter="right",
            hint="Usage: {op: eq, left: value1, right: value2}"
        )
    left = resolve(expr.get("left"), ctx)
    right = resolve(expr.get("right"), ctx)
    return left == right


def expr_not(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> bool:
    """Negate a boolean value.

    Parameters:
        arg: the value to negate

    Example:
        {op: not, arg: {$ref: state.disabled}}
    """
    if "arg" not in expr:
        raise ExpressionError(
            "Missing required parameter",
            operator="not",
            parameter="arg",
            hint="Usage: {op: not, arg: booleanValue}"
        )
    arg = resolve(expr.get("arg"), ctx)
    return not bool(arg)


def expr_lookup(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> Any:
    """Find an item in an array and return a field from it.

    Parameters:
        from: source array to search
        match: {field: fieldName, equals: valueToMatch}
        select: field name to return from matched item

    Example:
        {op: lookup, from: {$ref: state.users}, match: {field: "id", equals: "123"}, select: "name"}
    """
    source = resolve(expr.get("from"), ctx)

    if source is None:
        raise ExpressionError(
            "Source array is null",
            operator="lookup",
            parameter="from",
            expected="non-null array",
            hint="The 'from' parameter resolved to null. Check the reference path."
        )

    if not isinstance(source, list):
        raise ExpressionError(
            "Source is not an array",
            operator="lookup",
            parameter="from",
            expected="list",
            received=_type_name(source),
            hint="The 'from' parameter must be a list/array to search through."
        )

    match = expr.get("match", {})
    if not match:
        raise ExpressionError(
            "Missing required parameter",
            operator="lookup",
            parameter="match",
            expected="{field: string, equals: value}",
            hint="Usage: {op: lookup, from: [...], match: {field: 'id', equals: value}, select: 'fieldName'}"
        )

    field = match.get("field")
    if not field:
        raise ExpressionError(
            "Missing match field",
            operator="lookup",
            parameter="match.field",
            expected="string field name",
            hint="Specify which field to match on: match: {field: 'id', equals: ...}"
        )

    equals = resolve(match.get("equals"), ctx)
    select = expr.get("select")

    if not select:
        raise ExpressionError(
            "Missing required parameter",
            operator="lookup",
            parameter="select",
            expected="string field name to return",
            hint="Specify which field to return: select: 'fieldName'"
        )

    for i, item in enumerate(source):
        if not isinstance(item, dict):
            continue
        if item.get(field) == equals:
            if select not in item:
                raise ExpressionError(
                    f"lookup select field not found: '{select}'",
                    operator="lookup",
                    parameter="select",
                    hint=f"Item at index {i} matched but doesn't have field '{select}'. Available fields: {list(item.keys())}"
                )
            return item[select]

    raise ExpressionError(
        f"lookup found no match for {field}={_truncate(equals)}",
        operator="lookup",
        hint=f"Searched {len(source)} items but none had {field}={_truncate(equals)}"
    )


def expr_count_where(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> int:
    """Count items in an array that match a condition.

    Parameters:
        from: source array
        field: field name to check
        equals: value to match

    Example:
        {op: count_where, from: {$ref: state.items}, field: "status", equals: "active"}
    """
    items = resolve(expr.get("from"), ctx)
    field = expr.get("field")
    equals = resolve(expr.get("equals"), ctx)

    if items is None:
        logger.debug("count_where: source is null, returning 0")
        return 0

    if not isinstance(items, list):
        logger.debug("count_where: source is %s (not list), returning 0", _type_name(items))
        return 0

    if not field:
        raise ExpressionError(
            "Missing required parameter",
            operator="count_where",
            parameter="field",
            expected="string field name",
            hint="Usage: {op: count_where, from: [...], field: 'status', equals: 'active'}"
        )

    return sum(1 for item in items if isinstance(item, dict) and item.get(field) == equals)


def expr_any(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> bool:
    """Check if any item in an array matches a condition.

    Parameters:
        from: source array
        field: field name to check
        equals: value to match

    Example:
        {op: any, from: {$ref: state.items}, field: "status", equals: "error"}
    """
    items = resolve(expr.get("from"), ctx)
    field = expr.get("field")
    equals = resolve(expr.get("equals"), ctx)

    if items is None or not isinstance(items, list):
        return False

    if not field:
        raise ExpressionError(
            "Missing required parameter",
            operator="any",
            parameter="field",
            expected="string field name",
            hint="Usage: {op: any, from: [...], field: 'status', equals: 'active'}"
        )

    return any(isinstance(item, dict) and item.get(field) == equals for item in items)


def expr_unique(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> list:
    """Deduplicate array items by a specified field, preserving order.

    Parameters:
        from: source array
        by: field name to deduplicate by (optional, dedupes by value if not specified)

    Example:
        {op: unique, from: {$ref: state.items}, by: "id"}
    """
    items = resolve(expr.get("from"), ctx)
    by_field = expr.get("by")

    if items is None:
        logger.debug("unique: source is null, returning empty list")
        return []

    if not isinstance(items, list):
        logger.debug("unique: source is %s (not list), returning empty list", _type_name(items))
        return []

    if not by_field:
        # No field specified - dedupe by entire item (for simple values)
        seen: set = set()
        result = []
        for item in items:
            key = item if not isinstance(item, dict) else id(item)
            if key not in seen:
                seen.add(key)
                result.append(item)
        return result

    # Dedupe by specific field
    seen_values: set = set()
    result = []
    for item in items:
        if isinstance(item, dict):
            value = item.get(by_field)
            if value is not None and value not in seen_values:
                seen_values.add(value)
                result.append(item)
    return result


def expr_select(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> list:
    """Project specific fields from array items.

    Parameters:
        from: source array
        fields: list of field names to include

    Example:
        {op: select, from: {$ref: state.items}, fields: [id, name, status]}
    """
    items = resolve(expr.get("from"), ctx)
    fields = expr.get("fields", [])

    if items is None:
        logger.debug("select: source is null, returning empty list")
        return []

    if not isinstance(items, list):
        raise ExpressionError(
            "Source is not an array",
            operator="select",
            parameter="from",
            expected="list",
            received=_type_name(items),
            hint="The 'from' parameter must be a list of objects to project fields from."
        )

    if not fields:
        logger.debug("select: no fields specified, returning original items")
        return items

    if not isinstance(fields, list):
        raise ExpressionError(
            "Fields must be a list",
            operator="select",
            parameter="fields",
            expected="list of field names",
            received=_type_name(fields),
            hint="Usage: {op: select, from: [...], fields: ['id', 'name']}"
        )

    result = []
    for item in items:
        if isinstance(item, dict):
            result.append({k: item.get(k) for k in fields if k in item})
        else:
            result.append(item)
    return result


def expr_filter(expr: ExprDict, ctx: Context, resolve: ResolveFunc) -> list:
    """Filter array items by a condition.

    Parameters:
        from: source array
        where: condition object with field and comparison
            - field: field name to check
            - eq/ne/starts_with/not_starts_with/contains/not_null/in: comparison

    Example:
        {op: filter, from: {$ref: state.items}, where: {field: "status", eq: "active"}}
        {op: filter, from: {$ref: state.items}, where: {field: "name", starts_with: "test_"}}
        {op: filter, from: {$ref: state.items}, where: {field: "id", in: ["a", "b", "c"]}}
    """
    items = resolve(expr.get("from"), ctx)

    if items is None:
        logger.debug("filter: source is null, returning empty list")
        return []

    if not isinstance(items, list):
        # Return empty list for non-list input (lenient behavior)
        logger.debug("filter: source is %s (not list), returning empty list", _type_name(items))
        return []

    where = expr.get("where", {})
    if not where:
        return items

    field = where.get("field")
    if not field:
        raise ExpressionError(
            "Missing field in where condition",
            operator="filter",
            parameter="where.field",
            expected="string field name",
            hint="Usage: {op: filter, from: [...], where: {field: 'status', eq: 'active'}}"
        )

    result = []
    conditions_found = False

    for item in items:
        if not isinstance(item, dict):
            continue
        value = item.get(field)

        # Check various conditions
        if "eq" in where:
            conditions_found = True
            if value == resolve(where.get("eq"), ctx):
                result.append(item)
        elif "ne" in where:
            conditions_found = True
            if value != resolve(where.get("ne"), ctx):
                result.append(item)
        elif "starts_with" in where:
            conditions_found = True
            if isinstance(value, str) and value.startswith(where.get("starts_with")):
                result.append(item)
        elif "not_starts_with" in where:
            conditions_found = True
            if isinstance(value, str) and not value.startswith(where.get("not_starts_with")):
                result.append(item)
        elif "contains" in where:
            conditions_found = True
            if isinstance(value, str) and where.get("contains") in value:
                result.append(item)
        elif "not_null" in where and where.get("not_null"):
            conditions_found = True
            if value is not None:
                result.append(item)
        elif "in" in where:
            conditions_found = True
            in_set = resolve(where.get("in"), ctx)
            if isinstance(in_set, list) and value in in_set:
                result.append(item)

    if not conditions_found:
        raise ExpressionError(
            "No valid comparison operator in where condition",
            operator="filter",
            parameter="where",
            expected="one of: eq, ne, starts_with, not_starts_with, contains, not_null, in",
            received=str(list(where.keys())),
            hint="Add a comparison: {field: 'name', eq: 'value'} or {field: 'name', starts_with: 'prefix'}"
        )

    return result


# Registry of all expression operators
EXPR_OPS: dict[str, Callable[[ExprDict, Context, ResolveFunc], Any]] = {
    "any": expr_any,
    "concat": expr_concat,
    "coalesce": expr_coalesce,
    "count_where": expr_count_where,
    "filter": expr_filter,
    "get": expr_get,
    "len": expr_len,
    "eq": expr_eq,
    "not": expr_not,
    "lookup": expr_lookup,
    "select": expr_select,
    "unique": expr_unique,
}


def get_available_operators() -> list[str]:
    """Return list of available expression operators."""
    return sorted(EXPR_OPS.keys())

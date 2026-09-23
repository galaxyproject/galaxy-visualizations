from urllib.parse import urlencode

from .http import http


async def openapi_get(target, input, meta):
    path = meta["path"]
    query_params = []

    for k, v in input.items():
        placeholder = f"{{{k}}}"
        if placeholder in path:
            # Path parameter - substitute in URL
            path = path.replace(placeholder, str(v))
        elif isinstance(v, list):
            # Array parameter - add multiple entries with same key
            for item in v:
                query_params.append((k, item))
        else:
            # Single query parameter
            query_params.append((k, v))

    url = target.build_url(path)

    # Append query parameters if any.
    if query_params:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}{urlencode(query_params)}"

    headers = target.get_headers()
    return await http.request("GET", url, headers=headers)


async def _openapi_write(method, target, input, meta):
    """Path params substitute into the URL, everything else becomes the body."""
    path = meta["path"]
    body = {}

    for k, v in (input or {}).items():
        placeholder = f"{{{k}}}"
        if placeholder in path:
            path = path.replace(placeholder, str(v))
        else:
            body[k] = v

    url = target.build_url(path)
    headers = target.get_headers()
    return await http.request(method, url, headers=headers, body=body)


async def openapi_post(target, input, meta):
    return await _openapi_write("POST", target, input, meta)


async def openapi_put(target, input, meta):
    return await _openapi_write("PUT", target, input, meta)

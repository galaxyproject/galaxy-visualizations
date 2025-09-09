import asyncio
import json
import os
import pyodide_js
from js import XMLHttpRequest, File, FormData, fetch, Promise
from pyodide.ffi import create_proxy, to_js

# identifer types
IDENTIFIER_TYPES = {
    "hid": "hid-eq",
    "name": "name-contains",
    "tag": "tag-eq",
}

async def api(endpoint, method="GET", data=None):
    """
    Makes an HTTP request to a Galaxy API endpoint.

    Returns:
        The parsed JSON response if possible, otherwise raw text
    """
    url = get_api(endpoint)
    options = {
        "method": method.upper(),
        "headers": {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    }
    if data is not None:
        options["body"] = json.dumps(data)
    response = await fetch(url, to_js(options))
    if not response.ok:
        raise Exception(f"Galaxy API {method} {endpoint} failed: {response.status} - {await response.text()}")
    text = await response.text()
    try:
        return json.loads(text)
    except Exception:
        return text


async def get(datasets_identifiers, identifier_type="hid", history_id=None, retrieve_datatype=False):
    """
    Downloads dataset(s) from the current Galaxy history.
    In JupyterLite, saves files to virtual filesystem using `open()`.

    Returns:
        - A list of paths or a single path if only one dataset
        - Optionally, datatype(s) if `retrieve_datatype=True`
    """

    # collect all datasets from the history
    history_id = history_id or await get_history_id()
    history_datasets = await get_history(history_id, datasets_identifiers, identifier_type)

    # ensure directory
    os.makedirs(f"/{history_id}", exist_ok=True)

    # prep result lists
    file_path_all = []
    datatypes_all = []

    # backend vs client filtered results
    if filter_by_api(datasets_identifiers, identifier_type):
        datasets = history_datasets
    else:
        # convert to list
        if not isinstance(datasets_identifiers, list):
            datasets_identifiers = [datasets_identifiers]
        # match regex
        if identifier_type == "regex":
            datasets = _find_matching_datasets(history_datasets, datasets_identifiers)
        else:
            # match attributes
            datasets = []
            for ds in history_datasets:
                if identifier_type not in ds:
                    raise Exception(f"Unavailable dataset identifier type: {identifier_type}")
                if ds[identifier_type] in datasets_identifiers:
                    datasets.append(ds)

    # download filtered datasets
    for ds in datasets:
        path = await _download_dataset(ds)
        file_path_all.append(path)
        if retrieve_datatype:
            datatypes_all.append({dataset_id: ds["extension"]})
    if retrieve_datatype:
        if len(file_path_all) == 1:
            return file_path_all, datatypes_all[0][dataset_id]
        else:
            datatype_multi = {}
            for dt in datatypes_all:
                datatype_multi.update(dt)
            return file_path_all, datatype_multi
    else:
        return file_path_all[0] if len(file_path_all) == 1 else file_path_all


def get_api(url):
    """
    Returns a valid Galaxy API URL for the given endpoint path.

    - Strips leading slashes
    - Ensures the path does not duplicate 'api/'
    - Prepends the Galaxy root URL with a single '/api/' prefix
    """
    gxy = get_environment()
    root = gxy.get("root").rstrip("/")
    trimmed = url.lstrip("/")
    if trimmed.startswith("api/"):
        trimmed = trimmed[4:]
    return f"{root}/api/{trimmed}"


async def get_history(history_id=None, datasets_identifiers=None, identifier_type=None):
    """
       Get all visible dataset infos of user history.
       Return a list of dict of each dataset.
    """
    import json
    from js import fetch

    # identify target history
    history_id = history_id or await get_history_id()

    # use backend filtering if single identifer from map is provided
    query = ""
    if filter_by_api(datasets_identifiers, identifier_type):
        query = f"?v=dev&q={IDENTIFIER_TYPES[identifier_type]}&qv={datasets_identifiers}"
    url = get_api(f"/api/histories/{history_id}/contents{query}")

    # perform request
    response = await fetch(url)
    if not response.ok:
        raise Exception(f"Failed to fetch history {history_id}: {response.status}")
    text = await response.text()
    return json.loads(text)


def get_environment():
    """
    Returns the Galaxy environment configuration injected into the runtime.
    """
    if "__gxy__" in os.environ:
        return json.loads(os.environ["__gxy__"])
    raise RuntimeError("__gxy__ not found in environment")


async def get_history_id():
    """
    Returns the history ID associated with the current dataset.
    """
    gxy = get_environment()
    dataset_id = gxy.get("dataset_id")
    if not dataset_id:
        raise ValueError("Missing 'dataset_id' in gxy")
    url = get_api(f"/api/datasets/{dataset_id}")
    response = await fetch(url)
    if not response.ok:
        raise Exception(f"Failed to fetch dataset {dataset_id}: {response.status}")
    text = await response.text()
    data = json.loads(text)
    if "history_id" not in data:
        raise ValueError("Missing 'history_id' in dataset metadata", text)
    history_id = data["history_id"]
    if not history_id:
        raise ValueError("Undefined 'history_id' in dataset metadata", text)
    return history_id


async def put(name, output=None, ext="auto", dbkey="?", history_id=None):
    """
    Uploads a local file from the Pyodide virtual filesystem to the current Galaxy history.
    Uses XMLHttpRequest with FormData to ensure correct binary file transfer to /api/tools/fetch.
    """
    history_id = history_id or await get_history_id()
    file_bytes = pyodide_js.FS.readFile(name)
    file_obj = File.new([to_js(file_bytes)], name)
    form = FormData.new()
    form.append("history_id", history_id)
    form.append("targets", json.dumps([{
        "destination": {"type": "hdas"},
        "elements": [{
            "src": "files",
            "dbkey": dbkey,
            "ext": ext,
            "name": output or name
        }]
    }]))
    form.append("files_0|file_data", file_obj)
    xhr = XMLHttpRequest.new()
    future = asyncio.Future()
    onload = create_proxy(lambda e: future.set_result(xhr))
    onerror = create_proxy(lambda e: future.set_exception(Exception(f"Upload failed: {xhr.status} - {xhr.responseText}")))
    xhr.addEventListener("load", onload)
    xhr.addEventListener("error", onerror)
    xhr.open("POST", get_api("/api/tools/fetch"))
    xhr.send(form)
    response = await future
    try:
        return json.loads(response.responseText)
    except Exception:
        return response.responseText


async def _download_dataset(dataset):
    """
    Given a dataset object, its content is downloaded from Galaxy and stored in Pyodide’s virtual filesystem.

    Args:
        dataset: Object of dataset

    Returns:
        String path of stored file
    """
    dataset_id = dataset['id']
    history_id = dataset['history_id']
    history_content_type = dataset["history_content_type"]
    path = f"/{history_id}/{dataset_id}"

    # download only if not already written
    if not os.path.exists(path):
        if history_content_type == "dataset":
            url = get_api(f"/api/datasets/{dataset_id}/display")
            response = await fetch(url)
            if not response.ok:
                raise Exception(f"Failed to fetch dataset {dataset_id}: {response.status}")
            content_type = response.headers.get("Content-Type", "")
            if content_type.startswith("text/"):
                content = await response.text()
                with open(path, "w") as f:
                    f.write(content)
            else:
                buffer = await response.arrayBuffer()
                data = bytearray(buffer.to_py())
                with open(path, "wb") as f:
                    f.write(data)
        elif history_content_type == "dataset_collection":
            raise Exception("Not implemented.")

    return path


def _find_matching_datasets(history_datasets, list_of_regex_patterns):
    """
    Given a list of regex patterns, return matching dataset objects
    from the current Galaxy history.

    Args:
        list_of_regex_patterns: List of strings (regexes)

    Returns:
        List of matching dataset objects (non-redundant)
    """
    import re
    if isinstance(list_of_regex_patterns, str):
        list_of_regex_patterns = [list_of_regex_patterns]
    patterns = [re.compile(pat, re.IGNORECASE) for pat in list_of_regex_patterns]
    matching_datasets = {}
    for dataset in history_datasets:
        fname = dataset["name"]
        fid = dataset["id"]
        for pat in patterns:
            if pat.search(fname):
                print(f"🔍 Matched pattern on item {fid}: '{fname}'")
                matching_datasets[fid] = dataset
    return list(matching_datasets.values())


def filter_by_api(datasets_identifiers, identifier_type):
    return identifier_type in IDENTIFIER_TYPES and not isinstance(datasets_identifiers, list) and datasets_identifiers

__all__ = ["api", "get", "get_environment", "get_history", "get_history_id", "put"]

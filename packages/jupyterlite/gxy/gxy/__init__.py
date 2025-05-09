import asyncio
import json
import os
import pyodide_js
from js import XMLHttpRequest, File, FormData, fetch, Promise
from pyodide.ffi import create_proxy, to_js

async def get(datasets_identifiers, identifier_type='hid', history_id=None, retrieve_datatype=False):
    """
    Downloads dataset(s) from the current Galaxy history.
    In JupyterLite, saves files to virtual filesystem using `open()`.

    Returns:
        - A list of paths or a single path if only one dataset
        - Optionally, datatype(s) if `retrieve_datatype=True`
    """

    file_path_all = []
    datatypes_all = []

    # collect all datasets from the history
    history_id = history_id or await get_history_id()
    history_datasets = await get_history(history_id)
    datasets = {ds[identifier_type]: ds for ds in history_datasets}

    # filter datasets
    if not isinstance(datasets_identifiers, list):
        datasets_identifiers = [datasets_identifiers]
    if identifier_type == "regex":
        identifier_type = "hid"
        datasets_identifiers = _find_matching_ids(history_datasets, datasets_identifiers, identifier_type)

    # ensure directory
    os.makedirs(f"/{history_id}", exist_ok=True)

    # download filtered datasets
    for dataset_id in datasets_identifiers:
        if identifier_type == "hid":
            dataset_id = int(dataset_id)
        if dataset_id not in datasets:
            raise Exception(f"Unavailable dataset identifer: {dataset_id}")
        ds = datasets[dataset_id]
        path = f"/{history_id}/{dataset_id}"

        # download only if not already written
        if not os.path.exists(path):
            if ds["history_content_type"] == "dataset":
                url = get_api(f"/api/datasets/{ds['id']}/display")
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
                file_path_all.append(path)
            elif ds["history_content_type"] == "dataset_collection":
                raise Exception("Not implemented.")
        else:
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
    gxy = get_environment()
    root = gxy.get("root")
    trimmed = url[1:] if url.startswith("/") else url
    return f"{root}{trimmed}"


async def get_history(history_id=None):
    """
       Get all visible dataset infos of user history.
       Return a list of dict of each dataset.
    """
    import json
    from js import fetch
    history_id = history_id or await get_history_id()
    url = get_api(f"/api/histories/{history_id}/contents")
    response = await fetch(url)
    if not response.ok:
        raise Exception(f"Failed to fetch history {history_id}: {response.status}")
    text = await response.text()
    return json.loads(text)


def get_environment():
    if "__gxy__" in os.environ:
        return json.loads(os.environ["__gxy__"])
    raise RuntimeError("__gxy__ not found in environment")


async def get_history_id():
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


async def put(name, ext="auto", history_id=None):
    history_id = history_id or await get_history_id()
    file_bytes = pyodide_js.FS.readFile(name)
    file_obj = File.new([to_js(file_bytes)], name)
    form = FormData.new()
    form.append("history_id", history_id)
    form.append("targets", json.dumps([{
        "destination": {"type": "hdas"},
        "elements": [{
            "src": "files",
            "dbkey": "?",
            "ext": ext,
            "name": name
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
    return response.responseText


def _find_matching_ids(history_datasets, list_of_regex_patterns, identifier_type='hid'):
    """
    Given a list of regex patterns, return matching dataset HIDs or IDs
    from the current Galaxy history.

    Args:
        list_of_regex_patterns: List of strings (regexes)
        identifier_type: 'hid' or 'id'
        history_id: Optional history ID

    Returns:
        List of matching identifiers (hid or id)
    """
    import re
    if isinstance(list_of_regex_patterns, str):
        list_of_regex_patterns = [list_of_regex_patterns]
    patterns = [re.compile(pat, re.IGNORECASE) for pat in list_of_regex_patterns]
    matching_ids = []
    for dataset in history_datasets:
        fname = dataset["name"]
        fid = dataset["id"]
        fhid = dataset["hid"]
        for pat in patterns:
            if pat.match(fname):
                print(f"🔍 Matched pattern on item {fhid} ({fid}): '{fname}'")
                matching_ids.append(fhid if identifier_type == "hid" else fid)
    return list(set(matching_ids))


__all__ = ["get", "get_environment", "get_history", "get_history_id", "put"]

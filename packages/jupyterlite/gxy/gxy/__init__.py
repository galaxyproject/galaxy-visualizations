async def get(datasets_identifiers, identifier_type='hid', history_id=None, retrieve_datatype=False):
    """
    Downloads dataset(s) from the current Galaxy history.
    In JupyterLite, saves files to virtual filesystem using `open()`.

    Returns:
        - A list of paths or a single path if only one dataset
        - Optionally, datatype(s) if `retrieve_datatype=True`
    """
    from js import fetch
    import os

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
        datasets_identifiers = _find_matching_ids(datasets_identifiers, identifier_type, history_datasets)

    # download filtered datasets
    for dataset_id in datasets_identifiers:
        if identifier_type == "hid":
            dataset_id = int(dataset_id)
        ds = datasets[dataset_id]
        path = f"/import/{dataset_id}"

        # download only if not already written
        if not os.path.exists(path):
            if ds["history_content_type"] == "dataset":
                url = f"/api/datasets/{ds['id']}/display"
                response = await fetch(url)
                if not response.ok:
                    raise Exception(f"Failed to fetch dataset {dataset_id}: {response.status}")
                content = await response.text()
                with open(path, "w") as f:
                    f.write(content)
                file_path_all.append(path)
            elif ds["history_content_type"] == "dataset_collection":
                # not implemented, download zip and uncompress
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


async def get_history(history_id=None):
    """
       Get all visible dataset infos of user history.
       Return a list of dict of each dataset.
    """
    history_id = history_id or await get_history_id()
    url = f"/api/histories/{history_id}/contents"
    response = await fetch(url)
    if not response.ok:
        raise Exception(f"Failed to fetch history {history_id}: {response.status}")
    return await response.json()


async def get_history_id():
    """
        Returns the history identifer associated
        with the launching notebook dataset.
    """
    from js import window, fetch
    import urllib.parse
    query = window.location.search
    params = urllib.parse.parse_qs(query[1:])
    dataset_id_list = params.get("dataset_id")
    if not dataset_id_list:
        raise ValueError("Missing 'dataset_id' in URL query string")
    dataset_id = dataset_id_list[0]
    url = f"/api/datasets/{dataset_id}"
    response = await fetch(url)
    if not response.ok:
        raise Exception(f"Failed to fetch dataset {dataset_id}: {response.status}")
    data = await response.json()
    history_id = data.get("history_id")
    if not history_id:
        raise ValueError("Missing 'history_id' in dataset metadata")
    return history_id


async def put(filename, file_type="auto", history_id=None):
    from js import fetch, console, FormData, Blob

    history_id = history_id or await get_history_id()

    with open(filename, "r") as f:
        data = f.read()

    blob = Blob.new([data])
    form = FormData.new()
    form.append("files_0|file_data", blob, filename)
    form.append("files_0|type", "upload_dataset")
    form.append("files_0|dbkey", "?")
    form.append("files_0|file_type", file_type)
    form.append("history_id", history_id)

    response = await fetch("/api/tools", {
        "method": "POST",
        "body": form
    })

    if not response.ok:
        raise Exception(f"Upload failed: {response.status}")

    console.log(f"✅ Uploaded {filename} to Galaxy")


def _find_matching_ids(list_of_regex_patterns, identifier_type='hid', history_datasets):
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


print("🛰️ Galaxy helpers loaded. Use `get(dataset_id)` and `put(filename)` to interact with your Galaxy history.")
__all__ = ["get", "get_history", "put"]

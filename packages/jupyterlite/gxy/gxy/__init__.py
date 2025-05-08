def get(dataset_id, filename=None):
    from js import fetch, console
    import asyncio

    async def _download():
        url = f"/api/histories/current/contents/{dataset_id}/display"
        response = await fetch(url)
        if not response.ok:
            raise Exception(f"Failed to fetch dataset {dataset_id}: {response.status}")
        return await response.text()

    content = asyncio.run(_download())
    if filename is None:
        filename = f"dataset_{dataset_id}.txt"
    with open(filename, "w") as f:
        f.write(content)
    console.log(f"✅ Downloaded dataset {dataset_id} to", filename)

def put(filename, file_type="auto"):
    from js import fetch, console, FormData, Blob
    import asyncio

    async def _upload():
        with open(filename, "r") as f:
            data = f.read()
        blob = Blob.new([data], { "type": "text/plain" })
        form = FormData.new()
        form.append("files_0|file_data", blob, filename)
        form.append("files_0|type", "upload_dataset")
        form.append("files_0|dbkey", "?")
        form.append("files_0|file_type", file_type)
        form.append("history_id", "current")  # override if needed
        response = await fetch("/api/tools", {
            "method": "POST",
            "body": form
        })
        if not response.ok:
            raise Exception(f"Upload failed: {response.status}")
        console.log(f"✅ Uploaded {filename} to Galaxy")

print("🛰️  Galaxy helpers loaded. Use `get(dataset_id)` and `put(filename)` to interact with your Galaxy history.")
__all__ = ["get", "put"]

export async function getDataset(root, datasetId, credentials) {
    const response = await fetch(`${root}api/datasets/${datasetId}`, { credentials });
    if (!response.ok) {
        throw new Error(`Could not fetch dataset details: HTTP ${response.status}`);
    }
    return await response.json();
}

export async function fetchDataset(datasetUrl, credentials) {
    const response = await fetch(datasetUrl, { credentials });
    if (!response.ok) {
        throw new Error(`Could not fetch dataset: HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}

export async function uploadToHistory(root, historyId, name, extension, bytes, credentials) {
    const form = new FormData();
    form.append("history_id", historyId);
    form.append(
        "targets",
        JSON.stringify([
            {
                destination: { type: "hdas" },
                elements: [{ src: "files", name, ext: extension, dbkey: "?" }],
            },
        ]),
    );
    form.append("files_0|file_data", new Blob([bytes]), name);
    const response = await fetch(`${root}api/tools/fetch`, { method: "POST", body: form, credentials });
    if (!response.ok) {
        throw new Error(`Could not save ${name} to the history: HTTP ${response.status}`);
    }
    return await response.json();
}

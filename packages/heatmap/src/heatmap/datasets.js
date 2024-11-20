import { GalaxyApi } from "galaxy-charts";

const WAITTIME = 1000;

/** Wait helper */
function sleep() {
    return new Promise((resolve) => setTimeout(resolve, WAITTIME));
}

/** Build job dictionary */
export async function waitForDataset(datasetId) {
    const { data: dataset } = await GalaxyApi().GET(`/api/datasets/${datasetId}`);
    switch (dataset.state) {
        case "error":
            throw Error("Job failed. Dataset not valid.");
        case "ok":
            return dataset;
        default:
            await sleep();
            return waitForDataset(datasetId);
    }
}

/** Execute job and return output dataset identifier */
export async function submitJob(jobDict) {
    const { data } = await GalaxyApi().GET("/api/tools", jobDict);
    if (!data.outputs || data.outputs.length === 0) {
        throw Error("Job submission failed. No response.");
    } else {
        return data.outputs[0].id;
    }
}

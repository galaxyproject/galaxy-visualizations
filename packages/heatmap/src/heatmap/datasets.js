import { GalaxyApi } from "galaxy-charts";

const WAITTIME = 2000;

/** Wait helper */
function sleep() {
    return new Promise((resolve) => setTimeout(resolve, WAITTIME));
}

export async function waitForDataset(datasetId) {
    const { data } = await GalaxyApi().GET(`/api/datasets/${datasetId}`);
    switch (data.state) {
        case "error":
            throw Error("Dataset in error state.");
        case "ok":
            return data;
        default:
            await sleep();
            return waitForDataset(datasetId);
    }
}

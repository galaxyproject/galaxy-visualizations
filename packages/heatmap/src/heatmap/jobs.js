import { GalaxyApi } from "galaxy-charts";

/** build job dictionary */
export function buildJobDict(module, datasetId, tracks, trackKeys) {
    let columnsString = "";
    tracks.forEach((track, trackIndex) => {
        trackKeys.forEach((trackKey) => {
            columnsString += `${trackKey}_${trackIndex}:${parseInt(track[trackKey]) + 1}, `;
        });
    });
    columnsString = columnsString.substring(0, columnsString.length - 2);
    return {
        history_id: process.env.history_id,
        tool_id: "toolshed.g2.bx.psu.edu/repos/iuc/charts/charts/1.0.1",
        inputs: {
            columns: columnsString,
            input: { id: datasetId, src: "hda" },
            module,
        },
    };
}

/** Execute job and return output dataset identifier */
export async function submitJob(jobDict) {
    const { data } = await GalaxyApi().POST("/api/tools", jobDict);
    if (!data.outputs || data.outputs.length === 0) {
        console.error("Job submission failed. No response.");
    } else {
        return data.outputs[0].id;
    }
}

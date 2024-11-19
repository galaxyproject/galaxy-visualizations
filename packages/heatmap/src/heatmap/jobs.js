import { GalaxyApi } from "galaxy-charts";

/** Time to wait before refreshing to check if job has completed */
const WAITTIME = 1000;

/** build job dictionary */
export function buildJobDict(module, datasetId, tracks) {
    let columnsString = "";
    tracks.forEach((track, trackIndex) => {
        Object.entries(track).forEach(([trackKey, trackValue]) => {
            columnsString += `${trackKey}_${trackIndex}:${parseInt(trackValue) + 1}, `;
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

/** */
export async function submitJob(jobDict) {
    const response = await GalaxyApi().POST("/api/tools", jobDict);
    console.log(response);
    console.log("sending job");
}

/** Submit job request to charts tool
export function requestJobs(root, chart, parameters, success, error) {
    chart.state("wait", "Requesting job results...");
    if (chart.get("modified") && chart.get("dataset_id_job")) {
        requestAjax({
            type: "DELETE",
            url: `${root}api/histories/none/contents/${chart.get("dataset_id_job")}`,
        });
        chart.set("dataset_id_job", null);
        chart.set("modified", false);
    }
    if (chart.get("dataset_id_job")) {
        wait(root, chart, success, error);
    } else {
        chart.state("wait", "Sending job request...");
        requestAjax({
            type: "POST",
            url: `${root}api/tools`,
            data: parameters,
            success({ outputs }) {
                if (!outputs || outputs.length === 0) {
                    chart.state("failed", "Job submission failed. No response.");
                    if (error) {
                        error();
                    }
                } else {
                    const job = outputs[0];
                    chart.state(
                        "wait",
                        "Your job has been queued. You may close the browser window. The job will run in the background."
                    );
                    chart.set("dataset_id_job", job.id);
                    chart.save();
                    wait(root, chart, success, error);
                }
            },
            error(response) {
                let message = "";
                if (response && response.message && response.message.data && response.message.data.input) {
                    message = `${response.message.data.input}.`;
                }
                chart.state(
                    "failed",
                    `This visualization requires the '${parameters.tool_id}' tool. Please make sure it is installed. ${message}`
                );
                if (error) {
                    error();
                }
            },
        });
    }
}

// Request job details
function wait(root, chart, success, error) {
    requestAjax({
        type: "GET",
        url: `${root}api/datasets/${chart.get("dataset_id_job")}`,
        data: {},
        success(dataset) {
            let ready = false;
            switch (dataset.state) {
                case "ok":
                    chart.state("wait", "Job completed successfully...");
                    if (success) {
                        success(dataset);
                    }
                    ready = true;
                    break;
                case "error":
                    chart.state("failed", "Job has failed. Please check the history for details.");
                    if (error) {
                        error(dataset);
                    }
                    ready = true;
                    break;
                case "running":
                    chart.state(
                        "wait",
                        "Your job is running in the background and you may close the browser tab. Results will be available in your saved visualizations list."
                    );
            }
            if (!ready) {
                window.setTimeout(() => {
                    wait(root, chart, success, error);
                }, WAITTIME);
            }
        },
    });
}
*/

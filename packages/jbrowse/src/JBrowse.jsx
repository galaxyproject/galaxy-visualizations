import { useState, useEffect } from "react";
import { createViewState, JBrowseLinearGenomeView } from "@jbrowse/react-linear-genome-view";
import { createRoot, hydrateRoot } from "react-dom/client";

// @ts-expect-error no font types
import "@fontsource/roboto";

import GalaxyConnector from "./plugins/GalaxyConnector";

export default function (props) {
    const [viewState, setViewState] = useState();

    useEffect(() => {
        const state = createViewState({
            ...props.config,
            createRootFn: createRoot,
            hydrateFn: hydrateRoot,
            configuration: {
                rpc: {
                    defaultDriver: "WebWorkerRpcDriver",
                },
            },
            makeWorkerInstance: () => {
                console.log("Creating Worker...");
                return new Worker(new URL("./rpcWorker", import.meta.url), {
                    type: "module",
                });
            },
            plugins: [GalaxyConnector],
        });
        setViewState(state);
    }, []);

    if (!viewState) {
        return null;
    }

    return (
        <>
            <JBrowseLinearGenomeView viewState={viewState} />
        </>
    );
}

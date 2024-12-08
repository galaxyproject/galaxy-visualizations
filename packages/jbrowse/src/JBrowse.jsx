import { useState, useEffect } from "react";
import { createViewState, JBrowseLinearGenomeView } from "@jbrowse/react-linear-genome-view";

// @ts-expect-error no font types
import "@fontsource/roboto";

export default function (props) {
    const [viewState, setViewState] = useState();

    useEffect(() => {
        const state = createViewState(props.config);
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

import React from "react";
import ReactDOM from "react-dom/client";
import JBrowse from "./JBrowse";

export const renderJBrowse = (container, config) => {
    ReactDOM.createRoot(container).render(
        <React.StrictMode>
            <JBrowse config={config} />
        </React.StrictMode>,
    );
};

/*import React from "react";
import { createRoot } from "react-dom/client";
import ReactLinearGenome from "./ReactLinearGenome";

export const renderReactComponent = (container, jbrowseProps) => {
  const root = createRoot(container);
  root.render(<ReactLinearGenome {...jbrowseProps} />);
};*/

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './AppJbrowse'

import './index.css'

export const renderReactComponent = (container, jbrowseProps) => {
ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
}
// Just export everything from utilities for now.

export { merge, getAjax, requestAjax } from "./utilities/utils";
export { addZoom, makeTickFormat, makeUniqueCategories } from "./utilities/series";

// We have overlapping method names `request`, etc., in the following modules.  Assume direct access.
//export * from "utilities/datasets";
//export * from "utilities/jobs";
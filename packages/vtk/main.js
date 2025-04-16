import "@kitware/vtk.js/Rendering/Profiles/Geometry";

import vtkFullScreenRenderWindow from "@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkXMLPolyDataReader from "@kitware/vtk.js/IO/XML/XMLPolyDataReader";
import vtkPlyReader from "@kitware/vtk.js/IO/Geometry/PLYReader";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
            dataset_url: "kitchen.vtk", //"pyramid.vtk",//"horse.ply", // "human.vtp",
        },
    };

    // Attach config to the data-incoming attribute
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");

/** Now you can consume the incoming data in your application.
 * In this example, the data was attached in the development mode block.
 * In production, this data will be provided by Galaxy.
 */
const datasetId = incoming.visualization_config.dataset_id;
const datasetUrl = datasetId ? undefined : incoming.visualization_config.dataset_url;
const root = incoming.root;

/* Build the data request url. Modify the API route if necessary. */
const url = datasetUrl || `${root}api/datasets/${datasetId}/display`;

/** VTK.js */
const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
    rootContainer: appElement,
});
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();
const extension = "ply";
fetch(url)
    .then((res) => res.arrayBuffer())
    .then((arrayBuffer) => {
        if (["ply", "vtp"].includes(extension)) {
            const readerClass = {
                ply: vtkPlyReader,
                vtp: vtkXMLPolyDataReader,
            }[extension];
            const reader = readerClass.newInstance();
            reader.parseAsArrayBuffer(arrayBuffer);
            const polyData = reader.getOutputData(0);
            const mapper = vtkMapper.newInstance();
            mapper.setInputData(polyData);
            const actor = vtkActor.newInstance();
            actor.setMapper(mapper);
            renderer.addActor(actor);
            renderer.resetCamera();
            renderWindow.render();
        } else {
            appElement.innerHTML = `<strong>Invalid Extension: ${extension}</strong>`;
        }
    })
    .catch((err) => {
        appElement.innerHTML = `<strong>Failed Loading Dataset: ${url}</strong><br/><pre>${err}</pre>`;
        console.error(`Error loading vtk: ${url} ${err}`);
    });

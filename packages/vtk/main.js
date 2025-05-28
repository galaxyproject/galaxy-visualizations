import axios from "axios";

import "@kitware/vtk.js/Rendering/Profiles/Geometry";
import vtkFullScreenRenderWindow from "@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkXMLPolyDataReader from "@kitware/vtk.js/IO/XML/XMLPolyDataReader";
import vtkPlyReader from "@kitware/vtk.js/IO/Geometry/PLYReader";

// Available extensions
const PLYASCII = "plyascii";
const PLYBINARY = "plybinary";
const VTPASCII = "vtpascii";
const VTPBINARY = "vtpbinary";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
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
const root = incoming.root;

/* Build the data request url. Modify the API route if necessary. */
const url = `${root}api/datasets/${datasetId}/display`;

/** VTK.js */
const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
    rootContainer: appElement,
});
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();

async function render() {
    let extension = "";
    if (datasetId) {
        try {
            const { data } = await axios.get(`${root}api/datasets/${datasetId}`);
            extension = data.extension;
        } catch (err) {
            showError("Invalid Metadata", err);
        }
    } else {
        extension = datasetExtension;
    }
    fetch(url)
        .then((res) => res.arrayBuffer())
        .then((arrayBuffer) => {
            if ([PLYASCII, PLYBINARY, VTPASCII, VTPBINARY].includes(extension)) {
                const readerClass = {
                    [PLYASCII]: vtkPlyReader,
                    [PLYBINARY]: vtkPlyReader,
                    [VTPASCII]: vtkXMLPolyDataReader,
                    [VTPBINARY]: vtkXMLPolyDataReader,
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
                showError("Invalid Extension", extension);
            }
        })
        .catch((err) => {
            showError("Invalid Dataset", err);
        });
}

function showError(title, err) {
    appElement.innerHTML = `<strong>${title}: ${err}</strong>`;
    console.error(`Error loading vtk: ${err}`);
}

render();

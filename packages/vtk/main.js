import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkXMLPolyDataReader from '@kitware/vtk.js/IO/XML/XMLPolyDataReader';

// ----------------------------------------------------------------------------
// UI Setup (Optional control panel)
// ----------------------------------------------------------------------------

const controlPanel = `
  <p>Loaded earth.vtp from /public</p>
`;

const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance();
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();
fullScreenRenderer.addController(controlPanel);

// ----------------------------------------------------------------------------
// Load and render the VTP file
// ----------------------------------------------------------------------------

const reader = vtkXMLPolyDataReader.newInstance();

fetch('/dragon.ply')
  .then((res) => res.arrayBuffer())
  .then((arrayBuffer) => {
    reader.parseAsArrayBuffer(arrayBuffer);
    const polyData = reader.getOutputData(0);

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    renderer.addActor(actor);
    renderer.resetCamera();
    renderWindow.render();
  })
  .catch((err) => {
    console.error('Error loading earth.vtp:', err);
  });

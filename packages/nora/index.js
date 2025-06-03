import "script-loader!./htdocs/dicom/daikon.js";
import "script-loader!./htdocs/dicom/dicomReader.js";

import "script-loader!./htdocs/jquery.js";
import "./htdocs/alertify.core.css";
import "./htdocs/alertify.default.css";
import "./htdocs/styles_main.css";

import "./htdocs/fontawesome/font-awesome.css";
import "./htdocs/alertify.core.css";
import "./htdocs/alertify.default.css";
import "./htdocs/styles_main.css";
import "./htdocs/styles_KView.css";


import "script-loader!./htdocs/KMiscFuns.js";
import "script-loader!./htdocs/KForms.js";
import "script-loader!./htdocs/kmath.js";
import "script-loader!./htdocs/KStateManager.js";
import "script-loader!./htdocs/KView/KDataManager.js";
import "script-loader!./htdocs/KView/KViewPort.js";
import "script-loader!./htdocs/KView/KMedImageViewer.js";
import "script-loader!./htdocs/KView/KMedImg3D.js";
import "script-loader!./htdocs/KView/KMiscViewer.js";
import "script-loader!./htdocs/KView/KTableViewer.js";
import "script-loader!./htdocs/KView/KMedImgCurve.js";
import "script-loader!./htdocs/KView/nifti.js";
import "script-loader!./htdocs/KView/pako.js";
import "script-loader!./htdocs/alertify.js";
import "script-loader!./htdocs/notify.js";
import "script-loader!./htdocs/dragster.js";
import "script-loader!./htdocs/bruker2nifti.js";
import "script-loader!./htdocs/KTools/KTools.js";
import "script-loader!./htdocs/KTools/DBSsimulation.js";
import "script-loader!./htdocs/KTools/KAnnotationTool.js";
import "script-loader!./htdocs/KTools/KNavigationTool.js";
import "script-loader!./htdocs/KTools/KRoiTool.js";
import "script-loader!./htdocs/KTools/KObject3DTool.js";
import "script-loader!./htdocs/KTools/KCacheManager.js"
import "script-loader!./htdocs/KTools/KAtlasTool.js";
import "script-loader!./htdocs/KTableOperator.js";
import "script-loader!./htdocs/KView/KView.js";
import "script-loader!./htdocs/zip/zip.js";
import "script-loader!./htdocs/zip/inflate.js";


import "./htdocs/styles_KView.css";


import "script-loader!./htdocs/KMiscFuns.js";
import "script-loader!./htdocs/KForms.js";
import "script-loader!./htdocs/kmath.js";
import "script-loader!./htdocs/KStateManager.js";
import "script-loader!./htdocs/KView/KDataManager.js";
import "script-loader!./htdocs/KView/KViewPort.js";
import "script-loader!./htdocs/KView/KMedImageViewer.js";
import "script-loader!./htdocs/KView/KMedImg3D.js";
import "script-loader!./htdocs/KView/KMiscViewer.js";
import "script-loader!./htdocs/KView/KTableViewer.js";
import "script-loader!./htdocs/KView/KMedImgCurve.js";
import "script-loader!./htdocs/KView/nifti.js";
import "script-loader!./htdocs/KView/pako.js";
import "script-loader!./htdocs/alertify.js";
import "script-loader!./htdocs/notify.js";
import "script-loader!./htdocs/dragster.js";
import "script-loader!./htdocs/bruker2nifti.js";
import "script-loader!./htdocs/KTools/KTools.js";
import "script-loader!./htdocs/KTools/DBSsimulation.js";
import "script-loader!./htdocs/KTools/KAnnotationTool.js";
import "script-loader!./htdocs/KTools/KNavigationTool.js";
import "script-loader!./htdocs/KTools/KRoiTool.js";
import "script-loader!./htdocs/KTools/KObject3DTool.js";
import "script-loader!./htdocs/KTools/KCacheManager.js"
import "script-loader!./htdocs/KTools/KAtlasTool.js";
import "script-loader!./htdocs/KTableOperator.js";
import "script-loader!./htdocs/KView/KView.js";
import "script-loader!./htdocs/zip/zip.js";
import "script-loader!./htdocs/zip/inflate.js";

// Access container element
const appElement = document.querySelector("#app");

// Access attached data
const incoming = JSON.parse(appElement.dataset.incoming || "{}");
const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;
const metaUrl = `${root}api/datasets/${datasetId}`;

async function getData(url) {
    try {
        return await $.get(url);
    } catch (e) {
        console.error("Failed to retrieve data.", e);
    }
}

function getUrl(datasetId) {
    const rootWithoutProtocol = root.replace(/^[a-z]+:\/\//i, '');
    return `${rootWithoutProtocol}api/datasets/${datasetId}/display`;
}

async function render() {
    const metaData = await getData(metaUrl);

    setNORAenv({
        url_pref: root + "static/plugins/visualizations/nora/static/dist/"
    })

    console.debug("starting NORA's viewer");

    stateManager.setDefaultState();

    var KViewer = new KView($(appElement).parent());

    KViewer.crosshairMode = true;
    KViewer.showInfoBar = true;
    KViewer.globalCoordinates = true;
    KViewer.startImageLoader = startImageLoader;

    addKeyboardShortcuts()

    ViewerSettings.nVisibleCols = 2
    ViewerSettings.nVisibleRows = 2
    ViewerSettings.nVisibleBarports = 0;

    KViewer.ViewerSettings = ViewerSettings;
    KViewer.defaultFOV_mm = 220;
    KViewer.$screenShot.hide()
    KViewer.$iron.hide()
    KViewer.applyState()

    var loader = [{url: getUrl(datasetId), intendedName: metaData.name, filetype: metaData.extension, intent: {}}];
    KViewer.startImageLoader(loader,function() {});
}

render();

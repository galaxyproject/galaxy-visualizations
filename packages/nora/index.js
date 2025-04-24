import * as _ from "underscore";
import jQuery from "jquery";

// Explicitly expose jQuery globally
window.$ = window.jQuery = jQuery;

//import "script-loader!./htdocs/font-awesome-4.5.0/css/font-awesome.min.css";
import "script-loader!./htdocs/dicom/daikon.js";
import "script-loader!./htdocs/dicom/dicomReader.js";

import "./htdocs/alertify.core.css";
import "./htdocs/alertify.default.css";
import "./htdocs/styles_main.css";
import "./htdocs/styles_KView.css";

// Load all required scripts
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

// Set NORA environment
setNORAenv({
	url_pref: window.location.origin + "/static/plugins/visualizations/nora/static/dist/" 
});

// Define the load function in the global bundleEntries
window.bundleEntries = window.bundleEntries || {};
_.extend(window.bundleEntries, {
    load: function(options) {
        console.log("starting NORA's viewer");
        console.log(window.location.href);

        stateManager.setDefaultState();

        // Support both new visualization format and legacy format
        let visualization_config, visualization_plugin, root;
        try {
            const appElement = document.getElementById("app");
            if (appElement && appElement.dataset && appElement.dataset.incoming) {
                const incoming = JSON.parse(appElement.dataset.incoming);
                visualization_config = incoming.visualization_config;
                visualization_plugin = incoming.visualization_plugin;
                root = incoming.root;
                console.debug("New format detected:", { visualization_config, visualization_plugin, root });
            }
        } catch (e) {
            console.warn("Error parsing app data:", e);
        }
        
        // Use legacy format as fallback
        if (!visualization_config && options && options.dataset) {
            console.debug("Using legacy format");
        }

        // Get target element from options
        let $parent;
        if (options && options.target) {
            $parent = $(document.getElementById(options.target)).parent();
            $(document.getElementById(options.target)).remove();
        } else {
            $parent = $('body');
        }

        // Create and configure the KViewer
        var KViewer = new KView($parent);

        KViewer.crosshairMode = true;
        KViewer.showInfoBar = true;
        KViewer.globalCoordinates = true;
        KViewer.startImageLoader = startImageLoader;

        addKeyboardShortcuts();

        ViewerSettings.nVisibleCols = 2;
        ViewerSettings.nVisibleRows = 2;
        ViewerSettings.nVisibleBarports = 0;

        KViewer.ViewerSettings = ViewerSettings;
        KViewer.defaultFOV_mm = 220;

        KViewer.$screenShot.hide();
        KViewer.$iron.hide();

        KViewer.applyState();

        // Determine dataset information from either format
        const dataset = visualization_config || (options && options.dataset);
        
        if (!dataset) {
            console.error("No dataset information available");
            return;
        }

        console.log("Loading dataset:", dataset);

        // Get file information
        const intendedName = dataset.name;
        const filetype = dataset.extension;
        
        // Create loader with appropriate URL
        const downloadUrl = dataset.download_url || 
            (dataset.id ? `/api/datasets/${dataset.id}/display` : 
             (dataset.dataset_id ? `/api/datasets/${dataset.dataset_id}/display` : null));
             
        if (!downloadUrl) {
            console.error("No download URL available");
            return;
        }

        var loader = [{
            url: window.location.host + downloadUrl, 
            intendedName: intendedName,
            filetype: filetype,
            intent: {}
        }];
        
        KViewer.startImageLoader(loader, function() {
            console.log("NORA visualization loaded successfully");
        });
    }
});
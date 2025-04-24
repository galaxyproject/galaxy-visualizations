import * as _ from "underscore";
import jQuery from "jquery";

// Explicitly expose jQuery globally
window.$ = window.jQuery = jQuery;

//import "script-loader!./htdocs/font-awesome-4.5.0/css/font-awesome.min.css";
import "imports-loader?imports=default|jquery|jQuery!./htdocs/dicom/daikon.js";
import "imports-loader?imports=default|jquery|jQuery!./htdocs/dicom/dicomReader.js";

import "./htdocs/alertify.core.css";
import "./htdocs/alertify.default.css";
import "./htdocs/styles_main.css";
import "./htdocs/styles_KView.css";

// Load all required scripts
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KMiscFuns.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KForms.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/kmath.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KStateManager.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KView/KDataManager.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KView/KViewPort.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KView/KMedImageViewer.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KView/KMedImg3D.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KView/KMiscViewer.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KView/KTableViewer.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KView/KMedImgCurve.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KView/nifti.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KView/pako.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/alertify.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/notify.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/dragster.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/bruker2nifti.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KTools/KTools.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KTools/DBSsimulation.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KTools/KAnnotationTool.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KTools/KNavigationTool.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KTools/KRoiTool.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KTools/KObject3DTool.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KTools/KCacheManager.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KTools/KAtlasTool.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KTableOperator.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/KView/KView.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/zip/zip.js";
import "imports-loader?additionalCode=var this=window&imports=default|jquery|jQuery!./htdocs/zip/inflate.js";

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
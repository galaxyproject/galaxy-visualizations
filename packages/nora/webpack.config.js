const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");

var galaxyPath_noradest;
var htdocs;

var dist = "static/dist/"


if (process.env.GALAXY_ROOT != undefined && process.env.GALAXY_ROOT != "") // when running from dpx repo
{
    var galaxyPath = process.env.GALAXY_ROOT+"/"
    galaxyPath_noradest = galaxyPath+"config/plugins/visualizations/nora"
    htdocs = "../htdocs"    
}
else // when running in NORAview repo
{
    htdocs = "htdocs"    
    galaxyPath_noradest=path.join(__dirname)
}


module.exports = {
    mode: "production",
    devtool: "source-map",
    entry: "./index.js",
    output: {
        filename: dist+"script.js",
        path: galaxyPath_noradest
    },
    target: "web",
    plugins: [
        new MiniCssExtractPlugin(),
        new CopyPlugin({
            patterns: [
                { from: "nora.xml", to: "config/nora.xml" },                
                { from: "nora.png", to: "static/logo.png" },                
                { from: htdocs + "/logo_template.svg", to: dist+"logo.svg" },                
                { from: htdocs + "/babylon.js", to: dist+"babylon.js" },
                { from: htdocs + "/babylon.objFileLoader.js", to: dist+"babylon.objFileLoader.js" },
                { from: htdocs + "/models3d/LowPolyGirl.obj", to: dist+"models3d/LowPolyGirl.obj" },

                { from: htdocs + "/KTools/KOctreeImportWorker.js", to: dist+"KTools/KOctreeImportWorker.js" },
                { from: htdocs + "/KTools/KOctreeWorker.js", to: dist+"KTools/KOctreeWorker.js" },
                { from: htdocs + "/KTools/DBSsimulation_worker.js", to: dist+"KTools/DBSsimulation_worker.js" },
                { from: htdocs + "/KTools/KObject3DTool.js", to: dist+"KTools/KObject3DTool.js" },
                { from: htdocs + "/dicom/daikon.js", to: dist+"dicom/daikon.js" },
                { from: htdocs + "/KunpackWorker.js", to: dist+"KunpackWorker.js" },
                { from: htdocs + "/KuploadWorker.js", to: dist+"KuploadWorker.js" },
                { from: htdocs + "/KFibtrackWorker.js", to: dist+"KFibtrackWorker.js" },
                { from: htdocs + "/KImageProcWorker.js", to: dist+"KImageProcWorker.js" },
                { from: htdocs + "/KMiscFuns.js", to: dist+"KMiscFuns.js" },
                { from: htdocs + "/KView/KMedImageViewer.js", to: dist+"KView/KMedImageViewer.js" },
                { from: htdocs + "/kmath.js", to: dist+"kmath.js" },
                { from: htdocs + "/sparc.js", to: dist+"sparc.js" },
                { from: htdocs + "/KView/pako.js", to: dist+"KView/pako.js" },
                { from: htdocs + "/gifti-reader-min.js", to: dist+"gifti-reader-min.js" },

            ],
        }),
    ],
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: ["style-loader", "css-loader"],
            },
            {
                test: /\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)(\?.*$|$)/,
                use: {
                    loader: "file-loader",
                },
            },
        ],
    },
    performance: {
        hints: false,
    },
};

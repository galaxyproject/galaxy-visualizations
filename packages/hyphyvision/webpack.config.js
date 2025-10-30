const path = require("path");
const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
    mode: "production",
    entry: path.resolve(__dirname, "src/script.js"),
    output: {
        filename: "index.js",
        path: path.resolve(__dirname, "static"),
    },
    experiments: {
        importMeta: true,
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, "css-loader"],
            },
            {
                test: /\.scss$/,
                use: [MiniCssExtractPlugin.loader, "css-loader", "sass-loader"],
            },
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader",
                    options: { presets: ["@babel/preset-env"] },
                },
            },
            {
                test: /\.(gif|png|jpe?g|svg|json|bin|gz)$/i,
                type: "asset/resource",
            },
        ],
    },
    plugins: [
        new MiniCssExtractPlugin({ filename: "index.css" }),
        new webpack.ProvidePlugin({
            $: "jquery",
            jQuery: "jquery",
            "window.jQuery": "jquery",
        }),
    ],
    resolve: {
        modules: ["node_modules"],
        alias: {
            "phylotree.css": path.join(__dirname, "node_modules/phylotree/phylotree.css"),
        },
    },
};

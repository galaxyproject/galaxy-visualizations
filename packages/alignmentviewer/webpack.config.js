const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const webpack = require("webpack");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "production",
  entry: "./index.js",
  output: {
    filename: "index.js",
    path: path.resolve(__dirname, "static"),
    library: "AlignmentViewer2",
    libraryTarget: "umd",
    globalObject: "typeof self !== 'undefined' ? self : this"
  },
  resolve: {
    extensions: [".js", ".jsx", ".ts", ".tsx"],
    fallback: {
      process: require.resolve("process/browser")
    }
  },
  optimization: {
    minimize: true
  },
  plugins: [
    new MiniCssExtractPlugin({ filename: "index.css" }),
    new webpack.DefinePlugin({
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.PUBLIC_URL": "window.__PUBLIC_URL__ || '.'"
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: path.resolve(__dirname, "public"), to: path.resolve(__dirname, "static") }
      ]
    })
  ],
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              "@babel/preset-env",
              "@babel/preset-react",
              "@babel/preset-typescript"
            ]
          }
        }
      },
      {
        test: /\.(sa|sc|c)ss$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: "css-loader",
            options: {
              modules: {
                getLocalIdent: (context, localIdentName, localName) => {
                  return localName;
                }
              }
            }
          },
          "sass-loader"
        ]
      }
    ]
  }
};

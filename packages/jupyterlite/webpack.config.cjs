
const path = require('path');

module.exports = {
  entry: './src/extension.ts',
  mode: 'production',
  output: {
    filename: 'extension.js',
    path: path.resolve(__dirname, 'build'),
    library: {
      type: 'module'
    }
  },
  experiments: {
    outputModule: true,
    topLevelAwait: true
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.svg$/,
        type: 'asset/source'
      }
    ]
  }
};

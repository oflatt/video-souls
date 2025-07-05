const path = require("path");
 
module.exports = {
  // CUSTOMIZE HERE
  entry: './src/main.ts',
  optimization: {
    minimize: false,
  },
 
  // JUST KEEP THEM
  mode: "development",
  target: "web",
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: "ts-loader",
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
};
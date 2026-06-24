import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import HtmlWebpackPlugin from "html-webpack-plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Publisher prefix, single source of truth: kit.config.json at the repo root.
// The build and the deploy both read it, so the built artifact and the deployed
// webresource always share a name (the Fiddler autoresponder matches on that name).
const prefix = JSON.parse(
  readFileSync(path.resolve(__dirname, "kit.config.json"), "utf8")
).publisherPrefix;

/** Shared loader/resolve settings for both bundles. */
const common = {
  resolve: { extensions: [".ts", ".tsx", ".js"] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        // Transpile-only: `npm run typecheck` (tsc --noEmit) is the type gate.
        use: { loader: "ts-loader", options: { transpileOnly: true } },
      },
    ],
  },
  devtool: "source-map", // generated locally, never deployed
  performance: { hints: false },
};

/** clientui, single-bundle webresource shell + apps. */
const clientui = {
  ...common,
  name: "clientui",
  entry: path.resolve(__dirname, "clientui/index.ts"),
  output: {
    path: path.resolve(__dirname, "dist/clientui"),
    filename: `${prefix}clientui.js`,
    clean: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "clientui/html/clientui.html"),
      filename: `${prefix}clientui.html`,
      inject: false,
      // Keep one stable bundle name (Dataverse webresources keep their name across
      // releases) but stamp the script URL with a cache-busting token, so a
      // republished bundle is a different URL the browser/app cache must refetch.
      // The token is the compilation hash, so it changes only when the bundle does.
      templateParameters: (compilation) => ({
        scriptName: `${prefix}clientui.js`,
        cacheBust: compilation.hash,
      }),
    }),
  ],
};

/** clienthooks, UMD global bundle for form/ribbon/grid registration. */
const clienthooks = {
  ...common,
  name: "clienthooks",
  entry: path.resolve(__dirname, "clienthooks/index.ts"),
  output: {
    path: path.resolve(__dirname, "dist/clienthooks"),
    filename: `${prefix}clienthooks.js`,
    clean: true,
    library: { name: "CrmClientSide", type: "umd" },
  },
};

export default [clientui, clienthooks];

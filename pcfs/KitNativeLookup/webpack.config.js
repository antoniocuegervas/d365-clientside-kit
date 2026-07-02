const path = require("path");

/**
 * As a virtual control this project bundles almost nothing: react, react-dom,
 * and @fluentui/react-components are provided by the platform at runtime
 * (webpack externals, wired up by pcf-scripts from the manifest's
 * platform-library lines plus the pcfReactPlatformLibraries flag in
 * featureconfig.json).
 *
 * The icon package is the exception: it is not a platform library, so it
 * rides in the bundle. The control reaches it both from its own files and
 * from the kit's shared source OUTSIDE this project (../../../shared), and
 * without help webpack would resolve the shared side from the REPO-ROOT
 * node_modules, putting two copies of the icon package in the bundle.
 * Aliasing it to this project keeps it one copy.
 */
module.exports = {
  resolve: {
    alias: {
      "@fluentui/react-icons": path.resolve(__dirname, "node_modules/@fluentui/react-icons"),
    },
  },
};

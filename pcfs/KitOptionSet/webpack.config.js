const path = require("path");

/**
 * The control imports the kit's shared source from outside this project
 * (../../../shared). Without help, webpack resolves React and Fluent for that
 * shared code to the REPO-ROOT node_modules, while this control's own files (and
 * Fluent) resolve to the PCF's node_modules, so the bundle ends up with two
 * copies of React and Fluent. Two React copies means two hook dispatchers, and
 * Fluent v9's griffel hooks throw "Invalid hook call / more than one copy of
 * React" at runtime, leaving the control blank.
 *
 * Force a single copy of each shared singleton by aliasing them to this project's
 * node_modules. pcf-scripts merges this into its webpack config when
 * featureconfig.json sets pcfAllowCustomWebpack to "on".
 */
module.exports = {
  resolve: {
    alias: {
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "@fluentui/react-components": path.resolve(
        __dirname,
        "node_modules/@fluentui/react-components"
      ),
      "@fluentui/react-icons": path.resolve(__dirname, "node_modules/@fluentui/react-icons"),
    },
  },
};

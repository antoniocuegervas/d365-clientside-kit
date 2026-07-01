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
 *
 * This control needs two aliases the field/grid PCFs do not: the shared
 * DateTimeField pulls @fluentui/react-datepicker-compat (and timepicker-compat),
 * which are NOT re-exported through @fluentui/react-components, so without their
 * own aliases they resolve from the repo-root node_modules and drag the root's
 * tabster (8.8.0, unpinned) into the bundle, the version that collides with the
 * host's frozen tabster and blanks the control. Aliasing the compat packages to
 * this project is enough: their internal @fluentui/react-tabster and tabster then
 * resolve naturally within this project's tree, on the pinned 8.5.5. (Do NOT alias
 * tabster or @fluentui/react-tabster directly: aliasing a package to its directory
 * bypasses its package.json "exports", and react-tabster's own `import "tabster"`
 * then fails to resolve.)
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
      "@fluentui/react-datepicker-compat": path.resolve(
        __dirname,
        "node_modules/@fluentui/react-datepicker-compat"
      ),
      "@fluentui/react-timepicker-compat": path.resolve(
        __dirname,
        "node_modules/@fluentui/react-timepicker-compat"
      ),
    },
  },
};

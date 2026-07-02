const path = require("path");

/**
 * As a virtual control this project bundles almost nothing: react, react-dom,
 * and @fluentui/react-components are provided by the platform at runtime
 * (webpack externals, wired up by pcf-scripts from the manifest's
 * platform-library lines plus the pcfReactPlatformLibraries flag in
 * featureconfig.json).
 *
 * The two compat packages are the exception: the platform Fluent library does
 * not carry the date and time pickers, so they ride in the bundle. The control
 * reaches them through the kit's shared source OUTSIDE this project
 * (../../../shared), and without help webpack would resolve them for that
 * shared code from the REPO-ROOT node_modules, dragging the root's unpinned
 * tabster into the bundle, the version that collides with the host's frozen
 * tabster instance and blanks the control. Aliasing the compat packages to
 * this project is enough: their internal @fluentui/react-tabster and tabster
 * then resolve within this project's tree, on the pinned versions. (Do NOT
 * alias tabster or @fluentui/react-tabster directly: aliasing a package to its
 * directory bypasses its package.json "exports", and react-tabster's own
 * `import "tabster"` then fails to resolve.)
 */
module.exports = {
  resolve: {
    alias: {
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

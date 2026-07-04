/**
 * Renders the solution source tree before SolutionPackager packs it.
 *
 * Two generated pieces, both gitignored:
 * - src/Other/Solution.xml from Solution.template.xml, stamped with the
 *   publisher and prefix from kit.config.json and the version from the root
 *   package.json, so the packed component names always match the built
 *   artifacts (webpack reads the same kit.config.json).
 * - src/WebResources/ staged from dist/: the three shell webresources, each
 *   with the .data.xml metadata SolutionPackager expects beside the content.
 *
 * Webresource ids are derived deterministically from the webresource name
 * (UUID v5), so rebuilding never changes a component id and a managed update
 * upgrades the previous import instead of conflicting with it.
 *
 * Runs from the cdsproj (the RenderSolutionSrc target) or standalone:
 * node deployment/solution/render-src.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

const fail = (message) => {
  console.error(`render-src: ${message}`);
  process.exit(1);
};

//#region Inputs: kit.config.json and package.json

const kitConfig = JSON.parse(readFileSync(path.join(root, "kit.config.json"), "utf8"));
const prefix = kitConfig.publisherPrefix;
if (!prefix || !/^[A-Za-z][A-Za-z0-9]*_$/.test(prefix)) {
  fail(`kit.config.json publisherPrefix is "${prefix ?? "missing"}"; expected letters/digits with a trailing underscore, e.g. "new_"`);
}
// The prefix without the trailing underscore, the form Solution.xml carries
// (the same value pac pcf push takes; docs/adding-a-pcf.md walks the chain).
const barePrefix = prefix.slice(0, -1);

const solution = kitConfig.solutionName ?? "D365UIKit";
const publisher = kitConfig.publisherName ?? barePrefix;
const optionValuePrefix = kitConfig.optionValuePrefix ?? 10000;
if (!Number.isInteger(optionValuePrefix) || optionValuePrefix < 10000 || optionValuePrefix > 99999) {
  fail(`kit.config.json optionValuePrefix is "${optionValuePrefix}"; Dataverse requires an integer from 10000 to 99999`);
}

const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
if (!/^\d+\.\d+(\.\d+){0,2}$/.test(version)) {
  fail(`package.json version is "${version}"; expected a 2 to 4 part dotted version`);
}

//#endregion

//#region The webresource set (mirrors deployment/spkl.template.json)

const webresources = [
  {
    name: `${prefix}clientui.html`,
    file: path.join(root, "dist", "clientui", `${prefix}clientui.html`),
    type: 1,
    description: "Unified client UI shell (single HTML entry, ?app= selection)",
  },
  {
    name: `${prefix}clientui.js`,
    file: path.join(root, "dist", "clientui", `${prefix}clientui.js`),
    type: 3,
    description: "Client UI bundle, shell + registered apps",
  },
  {
    name: `${prefix}clienthooks.js`,
    file: path.join(root, "dist", "clienthooks", `${prefix}clienthooks.js`),
    type: 3,
    description: "CrmClientSide form/ribbon/grid hook library",
  },
];

const missing = webresources.filter((w) => !existsSync(w.file));
if (missing.length > 0) {
  fail(
    `built webresource artifacts missing:\n` +
      missing.map((w) => `  ${path.relative(root, w.file)}`).join("\n") +
      `\nRun npm run build at the repo root first (the build names artifacts from the same kit.config.json prefix).`
  );
}

//#endregion

//#region Rendering

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

// Stable ids: UUID v5 over the webresource name under a fixed namespace, so
// the id survives rebuilds (managed updates match on it) and a renamed
// resource (a different prefix) is a genuinely different component.
const ID_NAMESPACE = "6f0b84ae-e1c7-4518-89eb-86dcd1c89321";
const webresourceId = (name) => {
  const namespaceBytes = Buffer.from(ID_NAMESPACE.replaceAll("-", ""), "hex");
  const bytes = createHash("sha1").update(namespaceBytes).update(name, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const dataXml = (w) =>
  `<?xml version="1.0" encoding="utf-8"?>
<WebResource xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <WebResourceId>{${webresourceId(w.name)}}</WebResourceId>
  <Name>${escapeXml(w.name)}</Name>
  <DisplayName>${escapeXml(w.name)}</DisplayName>
  <Description>${escapeXml(w.description)}</Description>
  <WebResourceType>${w.type}</WebResourceType>
  <IntroducedVersion>${escapeXml(version)}</IntroducedVersion>
  <IsEnabledForMobileClient>0</IsEnabledForMobileClient>
  <IsAvailableForMobileOffline>0</IsAvailableForMobileOffline>
  <IsCustomizable>1</IsCustomizable>
  <CanBeDeleted>1</CanBeDeleted>
  <IsHidden>0</IsHidden>
  <FileName>/WebResources/${escapeXml(w.name)}</FileName>
</WebResource>
`;

// Webresource root components only: the build appends the type 66 entries for
// the referenced PCF controls itself, stamped with this same publisher prefix.
const rootComponents = webresources
  .map((w) => `      <RootComponent type="61" schemaName="${escapeXml(w.name)}" behavior="0" />`)
  .join("\n");

const template = readFileSync(path.join(here, "Solution.template.xml"), "utf8");
const solutionXml = template
  .replaceAll("{{solution}}", escapeXml(solution))
  .replaceAll("{{version}}", escapeXml(version))
  .replaceAll("{{publisher}}", escapeXml(publisher))
  .replaceAll("{{prefix}}", escapeXml(barePrefix))
  .replaceAll("{{optionvalueprefix}}", escapeXml(optionValuePrefix))
  .replaceAll("{{webresourcerootcomponents}}", rootComponents);
if (solutionXml.includes("{{")) {
  fail("Solution.template.xml contains a placeholder this script does not render.");
}

const webresourcesDir = path.join(here, "src", "WebResources");
rmSync(webresourcesDir, { recursive: true, force: true });
mkdirSync(webresourcesDir, { recursive: true });
for (const w of webresources) {
  copyFileSync(w.file, path.join(webresourcesDir, w.name));
  writeFileSync(path.join(webresourcesDir, `${w.name}.data.xml`), dataXml(w));
}
writeFileSync(path.join(here, "src", "Other", "Solution.xml"), solutionXml);

console.log(
  `render-src: solution "${solution}" ${version}, publisher "${publisher}" (prefix ${prefix}), ` +
    `${webresources.length} webresources staged from dist/.`
);

//#endregion

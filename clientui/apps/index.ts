/**
 * App registration manifest, single bundle, imports grouped by
 * category. Importing a module registers its app in the registry.
 */

// --- Shell + onboarding -----------------------------------------------
import "./template/app";
import "./samples-hub/app";

// --- Samples: everyday tier (start here) --------------------------------
import "./sample-company-search/app";

// --- Samples: composition tier ------------------------------------------
import "./sample-opportunity-search/app";
import "./sample-territory-cascade/app";

// --- Samples: exotic-data tier (limitation bypass) ------------------------
import "./sample-merged-grid/app";
import "./sample-activities-grid/app";

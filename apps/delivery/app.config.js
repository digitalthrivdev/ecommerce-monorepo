const fs = require("node:fs");
const path = require("node:path");

/**
 * Extends app.json. google-services.json (Firebase, needed for Android push) is kept out of git:
 * EAS builds receive it through the GOOGLE_SERVICES_JSON file environment variable.
 */
module.exports = ({ config }) => {
  const localFile = fs.existsSync(path.join(__dirname, "google-services.json")) ? "./google-services.json" : undefined;
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? localFile;

  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile && { googleServicesFile }) },
  };
};

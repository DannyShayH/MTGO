const { MetadataStorage } = require("@medusajs/framework/mikro-orm/core")

MetadataStorage.clear()

// Medusa loads `.env` in tests too, but never overrides a variable that is
// already set. An empty key keeps a developer's openrouteservice key out of
// every spec, so test runs never spend the shared provider quota. Specs that
// measure distances set their own key and point ORS_BASE_URL at a stand-in.
process.env.ORS_API_KEY = ""

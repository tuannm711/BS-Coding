// The V2 domain/schema version. Distinct from the app package version: it marks
// the shape of persisted V2 data and migrations, and moves only when that shape
// changes. Serializable — no Node/Electron imports.
export const V2_SCHEMA_VERSION = '2.0.0'

# Tilawat Catalog 2.0

The public catalogue and the local user library are deliberately separate concerns.

- `core.js` defines canonical recitations, variants, Arabic token normalisation, source detection, migration from the legacy flat-track model, procedural artwork, and the quality/default-source resolver.
- `mp3quran.js` is the first live catalogue adapter and uses the official MP3Quran v3 API. Additional adapters can be added without changing the player or local-library schema.

A canonical recitation keeps every known source in `variants[]`. The resolver chooses a default; it never deletes lower-quality or historical variants.

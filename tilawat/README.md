# تلاوات


تلاوات is no longer modeled as a flat list of unrelated links. It is a local-first listening catalogue for Qur'an recitations, organised around the **recitation itself**.

## One recitation, several sources

A catalogue entry can carry all of these at the same time:

- `youtubeId` / `youtubeUrl` — the original reference, metadata source and artwork source.
- `audioUrl` — a direct audio stream used for normal playback and background playback.
- `localAudioKey` — a device/downloaded copy stored in IndexedDB and preferred over the network.

Playback priority is:

`local copy → direct audio URL → YouTube fallback`

This means adding a clean MP3 later upgrades the existing entry instead of creating a second duplicate track. A rare YouTube recording can keep its original thumbnail and source reference while playing from a direct audio file in the background.

Legacy v1 entries are migrated automatically on startup:

- old `kind: youtube` → `youtubeId`
- old `kind: url` → `audioUrl`
- old `kind: file` / `blobKey` → `localAudioKey`

The IndexedDB database itself is unchanged, so existing libraries stay on the device.

## Catalogue structure

Entries can now be indexed by:

- reciter
- surah
- Hijri year
- mushaf / collection
- tags
- playlists
- rare-recitation flag

The home screen builds Spotify-like shelves dynamically from the local catalogue:

- Continue listening
- Recently added
- Rare recitations
- Favourites
- Reciters
- Years
- Mushafs / collections
- Surahs

Reciters, years, surahs, collections and playlists open their own browse page with play-all and shuffle controls.

## Search

Search is token based instead of one literal substring. Arabic text is normalised before matching, so a query such as:

`ياسر 1425 الكهف`

can match the reciter, year and surah independently. Harakat and common Alef/Hamza variants are ignored for matching.

## Library

The bottom navigation is intentionally reduced to three primary destinations:

- Home
- Search
- Library

Add and Settings stay in the top bar. The Library contains:

- all recitations
- favourites
- downloads
- recently played
- playlists

Manual drag ordering is still available for track lists.

## Adding and editing

The Add/Edit sheet exposes all sources for the same entry at once:

- YouTube URL
- direct audio URL
- local audio file
- artwork
- title
- reciter
- surah
- Hijri year
- mushaf / collection
- playlists
- tags
- rare flag
- optional start/end trim

Pasting a YouTube URL fetches the public oEmbed title/channel metadata and chooses the sharpest available YouTube thumbnail. Editing an existing entry can attach or replace its audio source later.

## Background playback and lock screen

Local files and direct audio streams use one long-lived `<audio>` element. Media Session provides lock-screen metadata and controls using the **actual resolved cover artwork** rather than only the app icon.

The player persists recent position and can resume a partially heard recitation. Queue handover, sleep timer, repeat, shuffle, speed, seeking and lock-screen transport remain supported.

YouTube remains the final fallback when no local/direct audio source exists. The embedded YouTube player does not provide the same reliable screen-off behaviour as `<audio>`.

## Downloads

A direct audio URL can be copied into IndexedDB for offline listening when the remote host permits CORS. Once downloaded, the local copy automatically takes priority. Removing the download falls back to `audioUrl`, then YouTube if necessary.

The service worker intentionally does not cache audio streams; Range requests stay on the network so seeking and long-form playback behave correctly.

## Visual language

The new interface keeps Spotify's useful information architecture without copying its branding:

- near-black / off-white surfaces
- restrained copper accent
- square artwork
- horizontal listening shelves
- compact entity rows for reciters, years and collections
- persistent mini player
- full-screen Now Playing sheet
- minimal borders instead of heavy shadows or 3D effects

## Cloudflare Pages

This repository is static and requires no build step.

- Framework preset: None
- Build command: leave empty
- Build output directory: `/`
- Production deployment is triggered automatically from GitHub Actions on pushes to `main`.

Both applications remain local-first. The deployed Cloudflare Pages site serves the application shell; the user's project library and recitation catalogue stay in the browser unless the user explicitly points a recitation at an external media URL.

## القرآن

The Quran tab is a full mushaf reader:

- Index of all 114 surahs with search by name or number (Arabic or Latin digits) and a Meccan/Medinan filter.
- Uthmani text set in Amiri Quran, with ornate ayah numbers, juz markers and sajda signs.
- Tap any ayah to read its التفسير الميسر in a sheet, step to the previous or next ayah, or copy it.
- «اقرأ وافهم» shows the tafsir under every ayah instead of the flowing mushaf page.
- Text size control, and the last ayah on screen is remembered for «تابع القراءة» on the Quran tab and on home.
- «استمع» plays the same surah from Yasser Al-Dosari's murattal mushaf without leaving the page.

Data lives in `data/quran/NNN.json` (one file per surah: text, tafsir, juz, page, sajda) plus `index.json`. It is generated by `tools/build_quran_data.py` from the Tanzil Uthmani text (kept verbatim, as its licence requires) and التفسير الميسر from the King Fahd Complex. Files are fetched on demand and kept by the service worker, so a surah opened once reads offline.

## Surah covers

Every surah has its own cover in `assets/covers/surah/NNN.jpg`, composed from the owner's five Yasser Al-Dosari photos with a different framing, a Meccan or Medinan tone and the surah's name. To use more photos, add them to `assets/covers/`, list them with their face position in `tools/surah-covers.html`, and run:

```bash
node tilawat/tools/make-surah-covers.mjs
```

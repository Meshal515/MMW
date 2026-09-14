# MMW

Two local-first web apps, deployed together from this repository.

- **Local** (`/`) — a web-project launcher and visual version timeline.
- **تلاوات** (`/tilawat/`) — a personal library of Qur'an recitations.

## Local

Local is a local-first web-project launcher and visual version timeline.

## What it does

- Import a static web project as ZIP, folder, or a single HTML file.
- Once installed, Local registers with the desktop OS as a handler for `.html` and `.zip`, so it appears in "Open with" beside the browsers and editors. Android has no such API, so there it registers as a share target and appears in the share sheet instead. Either way, a file whose title matches an existing project is offered as a new version of that project rather than a duplicate.
- Keep project files in browser IndexedDB on the current device.
- Give every project its own corner of storage. The runtime injected into a project prefixes the name of every store it opens with the project's id, so two projects can both use a key called `settings` without touching each other, a project cannot reach Local's own database by name, and deleting a project takes its data with it. This is attribution, not a security sandbox: a script on the same origin can still work around any wrapper. Real isolation needs a separate origin, which needs a domain.
- Deduplicate identical files by SHA-256 across versions.
- Add updates without destroying old versions.
- Adding an update adopts it immediately; the timeline is where you go back to an older version and adopt that instead.
- Delete a whole project, a single version, or every version but one. Files shared with a surviving version are kept; only what nothing points to is freed, and the confirmation states the real cost before anything is removed.
- Run a version full screen, with no Local chrome over it. On a touch device nothing whatsoever is drawn over the project, installed as an app or not — the system back gesture is the way out. On a pointer device a handle sits on the screen edge, opposite the project's own scrollbar. No keyboard shortcut is taken, so the project keeps Escape and every other key for itself.
- Explore the full project history on a pannable/zoomable timeline.
- Inspect file counts, size, lines, characters, file types, runtime console messages, and errors.
- Export the whole library to a single ZIP and restore it on another device. The archive carries the projects, their versions, their deduplicated files, `localStorage`, **and the IndexedDB databases the tools themselves wrote** — the last of these being the only data with no copy anywhere else. Restore merges: nothing already present is overwritten.
- Install as a PWA and continue using the app offline after the shell is cached.

## تلاوات

A private shelf of recitations, installable from Chrome as an app. No account, no
server of its own, and nothing uploaded anywhere: the library lives in this
browser's IndexedDB.

A recitation gets in one of three ways:

- **A YouTube link.** It plays through YouTube's own IFrame player, parked
  off-screen so only the sound reaches you, with a toggle to bring the video
  back. There is deliberately **no MP3 conversion**: YouTube serves no CORS
  headers and signs its stream URLs, so no page can turn a video into a file
  without a server in the middle. Apps that appear to do it in the browser are
  calling someone else's converter, which is why they keep breaking. These
  tracks need a connection.
- **A direct link to an audio file.** Streamed by `<audio>`, which is exempt from
  CORS. One button saves a copy into the browser for offline listening — that
  copy *does* need the host to allow CORS, and the app says so plainly when it
  cannot.
- **A file from the device.** Kept whole in IndexedDB and played with no network
  at all.

Either way the entry carries a title, reciter, surah, tags, and an optional
start/end trim for pulling one recitation out of a long video. The player adds
repeat (including repeat-one for memorising), shuffle, playback speed, a sleep
timer, and lock-screen and media-key control through the Media Session API.

Export writes the whole library to one JSON file. Device audio has no copy
outside this browser, so those entries are left out of the export rather than
restored as tracks that would never play.

## Cloudflare Pages

This repository is static and requires no build step.

- Framework preset: None
- Build command: leave empty
- Build output directory: `/`
- Production deployment is triggered automatically from GitHub Actions on pushes to `main`.

Imported projects and the recitation library both stay local to the browser. Neither is uploaded to this repository or to Cloudflare.

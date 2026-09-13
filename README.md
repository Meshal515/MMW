# Local

Local is a local-first web-project launcher and visual version timeline.

## What it does

- Import a static web project as ZIP, folder, or a single HTML file.
- Once installed, Local registers with the desktop OS as a handler for `.html` and `.zip`, so it appears in "Open with" beside the browsers and editors. Android has no such API, so there it registers as a share target and appears in the share sheet instead. Either way, a file whose title matches an existing project is offered as a new version of that project rather than a duplicate.
- Keep project files in browser IndexedDB on the current device.
- Deduplicate identical files by SHA-256 across versions.
- Add updates without destroying old versions.
- Adding an update adopts it immediately; the timeline is where you go back to an older version and adopt that instead.
- Delete a whole project, a single version, or every version but one. Files shared with a surviving version are kept; only what nothing points to is freed, and the confirmation states the real cost before anything is removed.
- Run a version full screen, with no Local chrome over it. On a touch device nothing is drawn over the project at all — the system back gesture is the way out. On a pointer device a handle sits on the screen edge, opposite the project's own scrollbar. No keyboard shortcut is taken, so the project keeps Escape and every other key for itself.
- Explore the full project history on a pannable/zoomable timeline.
- Inspect file counts, size, lines, characters, file types, runtime console messages, and errors.
- Export the whole library to a single ZIP and restore it on another device. The archive carries the projects, their versions, their deduplicated files, `localStorage`, **and the IndexedDB databases the tools themselves wrote** — the last of these being the only data with no copy anywhere else. Restore merges: nothing already present is overwritten.
- Install as a PWA and continue using the app offline after the shell is cached.

## Cloudflare Pages

This repository is static and requires no build step.

- Framework preset: None
- Build command: leave empty
- Build output directory: `/`
- Production deployment is triggered automatically from GitHub Actions on pushes to `main`.

The imported projects stay local to the browser. They are not uploaded to this repository or Cloudflare.

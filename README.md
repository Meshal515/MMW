# Local

Local is a local-first web-project launcher and visual version timeline.

## What it does

- Import a static web project as ZIP, folder, or a single HTML file.
- Keep project files in browser IndexedDB on the current device.
- Deduplicate identical files by SHA-256 across versions.
- Add updates without destroying old versions.
- Run any saved version and explicitly adopt the version shown on the home screen.
- Explore the full project history on a pannable/zoomable timeline.
- Inspect file counts, size, lines, characters, file types, runtime console messages, and errors.
- Install as a PWA and continue using the app offline after the shell is cached.

## Cloudflare Pages

This repository is static and requires no build step.

- Framework preset: None
- Build command: leave empty
- Build output directory: `/`
- Production deployment is triggered automatically from GitHub Actions on pushes to `main`.

The imported projects stay local to the browser. They are not uploaded to this repository or Cloudflare.

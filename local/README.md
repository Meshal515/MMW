# Local


Local is a local-first web-project launcher and visual version timeline.

## What it does

- Import a static web project as ZIP, folder, or single HTML file.
- Keep project files in browser IndexedDB on the current device.
- Deduplicate identical files by SHA-256 across versions.
- Add updates without destroying older versions.
- Run a selected version full screen.
- Explore version history on a visual timeline.
- Inspect file counts, sizes, types, console messages, and errors.
- Export and restore the whole local library.
- Install as a PWA and keep the application shell available offline.


## Run it

```bash
cd local
python3 -m http.server 8080
# open http://127.0.0.1:8080/
```

Deployed by `.github/workflows/deploy-local.yml` whenever `local/**` changes on `main`.

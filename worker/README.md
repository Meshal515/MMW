# tilawat-catalog

The small piece of server the catalogue cannot do without.

A browser cannot read another site's page — CORS forbids it — so metadata about
a recording has to be read somewhere else. That is all this does: it fetches a
public page someone pasted, reads what the page publishes about itself, and
returns the description.

Two rules keep it from becoming something worse:

1. **It returns descriptions, never bytes.** Audio comes back as a URL for the
   browser to play directly, so this can never be used as a general proxy or a
   way to launder someone else's bandwidth.
2. **It refuses anything that is not a public http(s) host** — loopback,
   private ranges, link-local and the cloud metadata address above all.

It does not log in anywhere, bypass any protection, or extract media a site has
not published as a plain link.

## Routes

| Route | Does |
|---|---|
| `GET /api/resolve?url=` | Reads a public page: OpenGraph, JSON-LD, `<audio>`/`<source>`, linked audio files, plus the year, mosque and quality claims stated in the prose |
| `GET /api/archive?id=` | Reshapes an archive.org item's published file listing |
| `GET /api/wayback?url=` | Where a dead page went, so a rotted link stays evidence |
| `GET /api/oembed?url=` | Title and thumbnail from providers that publish oEmbed |
| `GET /api/health` | Liveness, and whether D1 is bound |

## Deploying

```sh
npx wrangler d1 create tilawat-catalog          # paste the id into wrangler.toml
npx wrangler d1 execute tilawat-catalog --file=./schema.sql --remote
npx wrangler deploy
```

Then paste the Worker's URL into the app: **الإعدادات ← خادم الكتالوج**. With no
Worker configured the app keeps working; only reading indirect links goes quiet.

## Tests

```sh
node test-parse.mjs                    # pure: SSRF guard, page reading, claims
NODE_USE_ENV_PROXY=1 node test-worker.mjs   # routes, against live endpoints
```

## Schema

`schema.sql` holds the shared half only — reciters, recitations and the variants
found for them. What a listener keeps (favourites, downloads, history, the copy
they pinned) never comes here; that stays in their browser. Audio files are
never stored: a variant is a URL and a description of what lives at it.

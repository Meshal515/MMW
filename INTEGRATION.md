# Integration notes — `claude/quran-recitations-app-cipqb2`

> ورقة تسليم. هذا الفرع لا يُدمج كاملًا — يُسحب منه ما يلزم. كل ما فيه مبنيّ
> **فوق** فرع الكتالوج، لا بديلًا عنه: ملفات الواجهة والتنقّل والمشغّل أُخذت
> كما هي من `codex/tilawat-catalog-v2` دون تغيير في تصميمها.

This branch is built **on top of** `codex/tilawat-catalog-v2`, not as an
alternative to it. Its UI, navigation, player and styling were taken verbatim;
everything here is a layer above them. Pull what you need — the surface is
small and almost entirely additive.

What it adds: the catalogue keeps **every copy** of a recording instead of
three fixed source slots, picks which one plays without deleting the rest, draws
its own covers, and gains a Worker that can read a public page the browser is
not allowed to read.

---

## Group A — new files, zero conflict

Nothing in this list touches an existing file. Copy wholesale.

| File | What it is |
|---|---|
| `tilawat/js/arabic.js` | Arabic normalisation (diacritics, alef/ya/ta-marbuta, digits), query parsing (`ياسر 1425 الكهف` → years + words + surah), relevance scoring |
| `tilawat/js/model.js` | `makeRecitation` / `makeVariant`, `canonicalKey`, `sameRecording` |
| `tilawat/js/quality.js` | Quality scoring and `pickDefault` — chooses, never deletes |
| `tilawat/js/cover.js` | Procedural SVG covers + `resolveCover` priority |
| `tilawat/js/variants.js` | The bridge: derives `variants[]`, writes the winner back, suggestions |
| `tilawat/js/motion.js` | GSAP choreography; a no-op when GSAP is absent or motion is reduced |
| `tilawat/js/catalog/resolve.js` | Client for the Worker; silent and harmless when no endpoint is set |
| `tilawat/vendor/gsap.min.js`, `ScrollTrigger.min.js` | GSAP 3.13, vendored — see *Decisions* below |
| `worker/**` | The Worker, its D1 schema, and two test suites |

`cover.js` does not replace `covers.js`. The existing module resolves *image*
covers; this one draws artwork when there is no image to resolve.

---

## Group B — five edits to existing files

Every one is additive except where noted. Line numbers drift; match on content.

### 1. `tilawat/js/sources.js` — one object literal

In `normalizeTrack`, after `bytes`:

```js
    bytes: Number(raw.bytes || 0),
    variants: Array.isArray(raw.variants) ? raw.variants : [],
    preferredVariantId: raw.preferredVariantId || '',
    defaultVariantId: raw.defaultVariantId || ''
```

**This one is load-bearing.** `normalizeTrack` builds a fresh object, so without
these three lines every extra copy is silently dropped on each reload and
re-derived from the three legacy fields. That was a real bug, caught in test.

### 2. `tilawat/js/app.js` — imports

```js
import { ensureVariants, syncPrimary, addVariant, removeVariant, setPreferred,
         useVariant, suggestFor, badgesFor } from './variants.js';
import { coverSVG } from './cover.js';
import { bindSheet, refresh as refreshMotion, clearSheet } from './motion.js';
import { resolveUrl, toVariants, apiBase, setApiBase, hasApi } from './catalog/resolve.js';
```

### 3. `tilawat/js/app.js` — derive variants once, at load

```js
state.tracks = raw.map(normalizeTrack).map(ensureVariants);
```

### 4. `tilawat/js/app.js` — the sheet

`openNow` / `closeNow` are replaced (they bind and unbind the scroll
choreography and render the sections), `syncNow` gains one line, and the
variants block follows. `renderStrata`, the grid handlers, `downloadVariant`
and the attach dialog all live in that block.

### 5. `tilawat/js/app.js` — the settings field

The `apiSave` / `apiTest` handlers, near the backup handlers.

Plus markup and styles, both purely additive:

- `tilawat/index.html` — the two sections under the player, `#sourceDialog`,
  and the «خادم الكتالوج» field in settings (+84 lines, nothing removed)
- `tilawat/styles.css` — `.vgrid` / `.vcard` / `.strat` / `.cv` and the `--cv-*`
  tokens (+39 lines, appended)
- `tilawat/sw.js` — version bump and the new modules in `PRECACHE`
- `.github/workflows/validate.yml` — `node --check` for the new modules

---

## Decisions worth keeping or arguing with

**GSAP is vendored, not loaded from a CDN.** This is an offline-first PWA. A
motion library that only arrives with the network drops the page's animation
exactly when someone is listening on a plane — which is how the sandbox caught
it. 116 KB, precached.

**The Worker returns descriptions, never bytes.** Audio comes back as a URL the
browser plays directly, so it cannot become a general proxy or a way to launder
someone else's bandwidth. It also refuses every non-public host — loopback,
private ranges, link-local, and the cloud metadata address. Fourteen tests cover
that alone.

**The resolver chooses; it never removes.** A 64 kbps rip off a dead forum may
be the only copy taken from the original tape. Words on a page («أصلية»,
«منقّحة», «من الشريط الأصلي») are evidence, not proof, so they weigh less than
bitrate, codec and sample rate — and file size only counts once duration is
known, because an hour at 64 outweighs ten minutes at 320.

**Grouping is strict in one direction.** A 1425 تراويح must never absorb a
modern مصحف of the same surah because the modern one is cleaner. Reciter, surah,
collection, mosque and occasion must all agree; when one side has no year, only
a near-identical duration bridges the gap.

**The three playback fields stay derived.** `syncPrimary` writes the winner into
`localAudioKey` / `audioUrl` / `youtubeId`, so `player.js` needs no knowledge of
variants at all. The YouTube identity is never cleared — it is where the title
and artwork came from.

---

## Verifying a pull

```sh
cd worker
node test-parse.mjs                          # 30 checks: SSRF guard, page reading, claims
NODE_USE_ENV_PROXY=1 node test-worker.mjs    # 20 checks: routes, against live endpoints
```

The browser suites are not in the repo; they need a static server on `:8099`
and a CORS server on `:8098`. What they cover, so it can be re-tested after a
pull: four copies under one recitation surviving a reload, the preferred variant
overriding the resolver and persisting, the artwork dissolving on scroll,
generated covers taking their colour from the theme, and the app working
normally with no Worker configured.

Not reachable from the sandbox that wrote this, so untested live: YouTube
playback and `mp3quran.net` from a browser. Both were stubbed with captured
real responses.

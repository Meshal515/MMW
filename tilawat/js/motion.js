/* ── motion ───────────────────────────────────────────────────────────────────
   The choreography for the listening page.

   As the page scrolls past the player, the artwork does not cut away — it
   sinks, shrinks a little and dissolves, so the card reads as melting into the
   page rather than being switched off. Sections below enter with a small,
   short stagger and nothing else.

   GSAP ships inside the app rather than from a CDN: this is an offline-first
   PWA, and an animation library that only arrives with the network would drop
   the page's motion exactly when someone is listening on a plane. When it
   fails to load at all, or the listener asked for reduced motion, every
   function here becomes a no-op and the page simply works without it. */

const VENDOR = './vendor';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let ready = null;
function load() {
  if (ready) return ready;
  if (reduced()) { ready = Promise.resolve(null); return ready; }
  ready = new Promise(resolve => {
    const add = (src, next) => {
      const tag = document.createElement('script');
      tag.src = src;
      tag.async = false;
      tag.onload = next;
      tag.onerror = () => resolve(null);
      document.head.appendChild(tag);
    };
    add(`${VENDOR}/gsap.min.js`, () => add(`${VENDOR}/ScrollTrigger.min.js`, () => {
      if (window.gsap && window.ScrollTrigger) {
        window.gsap.registerPlugin(window.ScrollTrigger);
        resolve(window.gsap);
      } else resolve(null);
    }));
  });
  return ready;
}

let sheetTriggers = [];

export function clearSheet() {
  for (const trigger of sheetTriggers) { try { trigger.kill(); } catch {} }
  sheetTriggers = [];
  const hero = document.querySelector('.now__inner');
  if (hero) hero.style.cssText = '';
}

/**
 * Binds the dissolve and the section entrances inside the now-playing sheet.
 * `scroller` is the sheet itself, which scrolls rather than the document.
 */
export async function bindSheet(scroller) {
  clearSheet();
  const gsap = await load();
  if (!gsap || !scroller) return;
  const ScrollTrigger = window.ScrollTrigger;

  const hero = scroller.querySelector('.now__inner');
  const art = scroller.querySelector('.now__artwrap');
  const meta = scroller.querySelector('.now__meta');

  if (art) {
    // Only the artwork and its caption fade; the transport stays legible so a
    // listener scrolling the copies can still pause what is playing.
    sheetTriggers.push(gsap.timeline({
      scrollTrigger: {
        scroller, trigger: hero, start: 'top top', end: '+=320', scrub: 0.6
      }
    })
      .to(art, { y: 46, scale: 0.9, opacity: 0, ease: 'none' }, 0)
      .to(meta, { y: 26, opacity: 0.15, ease: 'none' }, 0)
      .scrollTrigger);
  }

  for (const section of scroller.querySelectorAll('[data-reveal]')) {
    const cards = section.querySelectorAll('[data-reveal-item]');
    if (!cards.length) continue;
    gsap.set(cards, { y: 16, opacity: 0 });
    sheetTriggers.push(gsap.to(cards, {
      y: 0, opacity: 1, duration: 0.42, ease: 'power2.out', stagger: 0.045,
      scrollTrigger: { scroller, trigger: section, start: 'top 88%', once: true }
    }).scrollTrigger);
  }

  ScrollTrigger.refresh();
}

/** Re-measures after the sheet's content changes height. */
export async function refresh() {
  const gsap = await load();
  if (gsap && window.ScrollTrigger) window.ScrollTrigger.refresh();
}

/**
 * Carries the tapped card into the sheet: the cover appears to grow from where
 * it sat in the grid. Falls back to the plain sheet slide when GSAP is absent.
 */
export async function flipIn(fromEl, toEl) {
  const gsap = await load();
  if (!gsap || !fromEl || !toEl) return;
  const from = fromEl.getBoundingClientRect();
  const to = toEl.getBoundingClientRect();
  if (!from.width || !to.width) return;
  gsap.fromTo(toEl, {
    x: from.left + from.width / 2 - (to.left + to.width / 2),
    y: from.top + from.height / 2 - (to.top + to.height / 2),
    scale: from.width / to.width,
    opacity: 0.85
  }, { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.46, ease: 'power3.out' });
}

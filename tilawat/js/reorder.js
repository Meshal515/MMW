/* ── reorder ──────────────────────────────────────────────────────────────────
   Drag a row by its handle and the list rearranges under it.

   Built on pointer events so one code path covers touch and mouse, and on
   `transform` alone so nothing reflows mid-drag — the dragged row follows the
   finger 1:1 with no transition, while the rows it displaces slide on a short
   eased one. Rows here are a uniform height, so the gap between the first two
   is the step size and the drop index is pure arithmetic. */

const EASE = 'transform .19s cubic-bezier(.2, .8, .26, 1)';
const EDGE = 84;      // start auto-scrolling within this many px of the edge
const EDGE_SPEED = 13;

export function makeSortable(list, { handle: handleSelector, item: itemSelector, onDrop }) {
  let ctx = null;

  function apply() {
    if (!ctx) return;
    ctx.item.style.transform = `translateY(${ctx.delta}px) scale(1.02)`;
    for (let i = 0; i < ctx.items.length; i++) {
      const el = ctx.items[i];
      if (el === ctx.item) continue;
      let shift = 0;
      if (ctx.from < ctx.to && i > ctx.from && i <= ctx.to) shift = -ctx.step;
      else if (ctx.from > ctx.to && i >= ctx.to && i < ctx.from) shift = ctx.step;
      el.style.transform = shift ? `translateY(${shift}px)` : '';
    }
  }

  function recompute() {
    const moved = Math.round(ctx.delta / ctx.step);
    const to = Math.max(0, Math.min(ctx.items.length - 1, ctx.from + moved));
    if (to !== ctx.to) {
      ctx.to = to;
      if (navigator.vibrate) { try { navigator.vibrate(4); } catch {} }
    }
    apply();
  }

  /* Dragging past the edge of the viewport has to keep the list moving, and the
     scroll it causes is part of the drag distance. */
  function edgeScroll() {
    if (!ctx) return;
    const y = ctx.pointerY;
    let step = 0;
    if (y < EDGE) step = -EDGE_SPEED * (1 - y / EDGE);
    else if (y > innerHeight - EDGE) step = EDGE_SPEED * (1 - (innerHeight - y) / EDGE);
    if (step) {
      const before = scrollY;
      scrollBy(0, step);
      ctx.delta += scrollY - before;
      recompute();
    }
    ctx.raf = requestAnimationFrame(edgeScroll);
  }

  function onDown(event) {
    if (event.button > 0) return;
    const handle = event.target.closest(handleSelector);
    if (!handle || !list.contains(handle)) return;
    const item = handle.closest(itemSelector);
    const items = [...list.querySelectorAll(itemSelector)];
    if (!item || items.length < 2) return;

    event.preventDefault();
    try { handle.setPointerCapture(event.pointerId); } catch {}

    const first = items[0].getBoundingClientRect();
    const step = Math.round(items[1].getBoundingClientRect().top - first.top) || Math.round(first.height);
    const from = items.indexOf(item);

    ctx = { handle, item, items, step, from, to: from, startY: event.clientY,
            pointerY: event.clientY, delta: 0, startScroll: scrollY, pointerId: event.pointerId, raf: 0 };

    for (const el of items) el.style.transition = EASE;
    item.style.transition = 'none';
    item.classList.add('is-dragging');
    list.classList.add('is-sorting');
    document.body.classList.add('is-dragging');
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch {} }
    ctx.raf = requestAnimationFrame(edgeScroll);
  }

  function onMove(event) {
    if (!ctx || event.pointerId !== ctx.pointerId) return;
    event.preventDefault();
    ctx.pointerY = event.clientY;
    ctx.delta = (event.clientY - ctx.startY) + (scrollY - ctx.startScroll);
    recompute();
  }

  function finish(commit) {
    if (!ctx) return;
    const done = ctx;
    ctx = null;
    cancelAnimationFrame(done.raf);
    try { done.handle.releasePointerCapture(done.pointerId); } catch {}

    // Settle into the target slot first. Then move the actual DOM node into that
    // slot before persisting, so the saved order matches what the user just saw.
    done.item.style.transition = EASE;
    done.item.style.transform = `translateY(${(done.to - done.from) * done.step}px)`;
    done.item.classList.remove('is-dragging');

    setTimeout(() => {
      if (commit && done.to !== done.from) {
        const target = done.items[done.to];
        if (done.to > done.from) target.after(done.item);
        else target.before(done.item);
      }
      for (const el of done.items) { el.style.transition = ''; el.style.transform = ''; }
      list.classList.remove('is-sorting');
      document.body.classList.remove('is-dragging');
      if (commit && done.to !== done.from) onDrop(done.from, done.to);
    }, 190);
  }

  list.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: false });
  addEventListener('pointerup', () => finish(true));
  addEventListener('pointercancel', () => finish(false));
}

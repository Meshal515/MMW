/* ── reorder ──────────────────────────────────────────────────────────────────
   Drag a row by its handle and rearrange the list without rebuilding it.

   Pointer movement updates only the dragged row on every animation frame. Other
   rows are touched only when the target slot changes. On drop, transitions are
   temporarily disabled while the DOM node is moved so the generic card transform
   transition cannot replay a second, visible settling animation. */

const EASE = 'transform .19s cubic-bezier(.2, .8, .26, 1)';
const SETTLE_MS = 190;
const ACTIVATION_PX = 6;
const EDGE = 84;
const EDGE_SPEED = 13;
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function makeSortable(list, { handle: handleSelector, item: itemSelector, onDrop }) {
  let ctx = null;

  function desiredShift(index) {
    if (!ctx || index === ctx.from) return 0;
    if (ctx.from < ctx.to && index > ctx.from && index <= ctx.to) return -ctx.step;
    if (ctx.from > ctx.to && index >= ctx.to && index < ctx.from) return ctx.step;
    return 0;
  }

  function syncShiftedRows() {
    if (!ctx) return;
    const nextShifted = new Set();
    for (let i = 0; i < ctx.items.length; i++) {
      const el = ctx.items[i];
      if (el === ctx.item) continue;
      const shift = desiredShift(i);
      if (shift) {
        nextShifted.add(el);
        if (!ctx.shifted.has(el)) {
          el.style.transition = REDUCED() ? 'none' : EASE;
          el.style.willChange = 'transform';
        }
        el.style.transform = `translate3d(0,${shift}px,0)`;
      } else if (ctx.shifted.has(el)) {
        el.style.transition = REDUCED() ? 'none' : EASE;
        el.style.transform = '';
        el.style.willChange = '';
      }
    }
    ctx.shifted = nextShifted;
  }

  function renderFrame() {
    if (!ctx) return;
    ctx.frame = 0;
    ctx.item.style.transform = `translate3d(0,${ctx.delta}px,0) scale(1.02)`;

    const moved = Math.round(ctx.delta / ctx.step);
    const to = Math.max(0, Math.min(ctx.items.length - 1, ctx.from + moved));
    if (to !== ctx.to) {
      ctx.to = to;
      syncShiftedRows();
      if (navigator.vibrate) { try { navigator.vibrate(4); } catch {} }
    }
  }

  function scheduleFrame() {
    if (!ctx || ctx.frame) return;
    ctx.frame = requestAnimationFrame(renderFrame);
  }

  function edgeScroll() {
    if (!ctx || !ctx.active) return;
    const y = ctx.pointerY;
    let amount = 0;
    if (y < EDGE) amount = -EDGE_SPEED * (1 - y / EDGE);
    else if (y > innerHeight - EDGE) amount = EDGE_SPEED * (1 - (innerHeight - y) / EDGE);
    if (amount) {
      const before = scrollY;
      scrollBy(0, amount);
      const scrolled = scrollY - before;
      if (scrolled) {
        ctx.delta += scrolled;
        scheduleFrame();
      }
    }
    ctx.scrollFrame = requestAnimationFrame(edgeScroll);
  }

  function activate() {
    if (!ctx || ctx.active) return;
    ctx.active = true;
    ctx.item.style.transition = 'none';
    ctx.item.style.willChange = 'transform';
    ctx.item.classList.add('is-dragging');
    list.classList.add('is-sorting');
    document.body.classList.add('is-dragging');
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch {} }
    ctx.scrollFrame = requestAnimationFrame(edgeScroll);
  }

  function onDown(event) {
    if (event.button !== undefined && event.button > 0) return;
    const handle = event.target.closest(handleSelector);
    if (!handle || !list.contains(handle)) return;
    const item = handle.closest(itemSelector);
    const items = [...list.querySelectorAll(itemSelector)];
    if (!item || items.length < 2) return;

    const first = items[0].getBoundingClientRect();
    const second = items[1].getBoundingClientRect();
    const step = Math.round(second.top - first.top) || Math.round(first.height);
    if (!step) return;

    try { handle.setPointerCapture(event.pointerId); } catch {}
    ctx = {
      handle, item, items, step,
      from: items.indexOf(item), to: items.indexOf(item),
      startY: event.clientY, pointerY: event.clientY, pointerId: event.pointerId,
      startScroll: scrollY, delta: 0, active: false,
      frame: 0, scrollFrame: 0, shifted: new Set()
    };
  }

  function onMove(event) {
    if (!ctx || event.pointerId !== ctx.pointerId) return;
    ctx.pointerY = event.clientY;
    ctx.delta = (event.clientY - ctx.startY) + (scrollY - ctx.startScroll);
    if (!ctx.active && Math.abs(ctx.delta) < ACTIVATION_PX) return;
    if (!ctx.active) activate();
    event.preventDefault();
    scheduleFrame();
  }

  function clearInlineStyles(done) {
    const touched = new Set([done.item, ...done.shifted]);
    for (const el of touched) {
      el.style.transition = 'none';
      el.style.transform = '';
    }
    requestAnimationFrame(() => {
      for (const el of touched) {
        el.style.transition = '';
        el.style.willChange = '';
      }
    });
  }

  function commitDom(done) {
    if (done.to === done.from) return;
    const target = done.items[done.to];
    if (done.to > done.from) target.after(done.item);
    else target.before(done.item);
  }

  function finish(commit, pointerId) {
    if (!ctx || (pointerId !== undefined && pointerId !== ctx.pointerId)) return;
    const done = ctx;
    ctx = null;
    if (done.frame) cancelAnimationFrame(done.frame);
    if (done.scrollFrame) cancelAnimationFrame(done.scrollFrame);
    try { done.handle.releasePointerCapture(done.pointerId); } catch {}

    if (!done.active) return;

    done.item.classList.remove('is-dragging');
    const targetOffset = commit ? (done.to - done.from) * done.step : 0;
    done.item.style.transition = REDUCED() ? 'none' : EASE;
    done.item.style.transform = targetOffset ? `translate3d(0,${targetOffset}px,0) scale(1.02)` : '';

    const settle = REDUCED() ? 0 : SETTLE_MS;
    setTimeout(() => {
      // Keep transitions disabled across the DOM move and transform cleanup. This
      // prevents identity.css's generic .media-card transform transition from
      // replaying after the row has already visually settled into its slot.
      const touched = new Set([done.item, ...done.shifted]);
      for (const el of touched) el.style.transition = 'none';
      if (commit) commitDom(done);
      clearInlineStyles(done);
      list.classList.remove('is-sorting');
      document.body.classList.remove('is-dragging');
      if (commit && done.to !== done.from) onDrop(done.from, done.to);
    }, settle);
  }

  list.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: false });
  addEventListener('pointerup', event => finish(true, event.pointerId));
  addEventListener('pointercancel', event => finish(false, event.pointerId));
}

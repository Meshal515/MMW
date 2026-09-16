/* ── reorder ──────────────────────────────────────────────────────────────────
   Drag a row by its handle and rearrange the list without rebuilding it.

   Pointer movement updates only the dragged row on every animation frame. Other
   rows are touched only when the target slot changes. On drop we use a FLIP-style
   handoff: capture the pixels users are looking at, move the existing DOM node,
   invert that layout change, then settle to the new slot. That prevents a frame
   where the old translated layout and the committed layout visually overlap. */

const EASE = 'transform .20s cubic-bezier(.16, 1, .3, 1)';
const SETTLE_MS = 210;
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

  function touchedRows(done) {
    return new Set([done.item, ...done.shifted]);
  }

  function finishCleanup(done, touched) {
    for (const el of touched) {
      el.style.transition = '';
      el.style.transform = '';
      el.style.willChange = '';
    }
    done.item.classList.remove('is-dragging');
    list.classList.remove('is-sorting');
    document.body.classList.remove('is-dragging');
  }

  function commitDom(done) {
    if (done.to === done.from) return;
    const target = done.items[done.to];
    if (done.to > done.from) target.after(done.item);
    else target.before(done.item);
  }

  function settleWithoutMove(done) {
    const touched = touchedRows(done);
    if (REDUCED()) {
      finishCleanup(done, touched);
      return;
    }
    for (const el of touched) {
      el.style.transition = EASE;
      el.style.transform = '';
      el.style.willChange = 'transform';
    }
    setTimeout(() => finishCleanup(done, touched), SETTLE_MS + 24);
  }

  function commitWithFlip(done) {
    const touched = touchedRows(done);
    const before = new Map();
    for (const el of touched) before.set(el, el.getBoundingClientRect());

    /* Move only the existing row. No clone and no list rebuild. */
    for (const el of touched) el.style.transition = 'none';
    commitDom(done);
    for (const el of touched) el.style.transform = '';

    if (REDUCED()) {
      if (done.to !== done.from) onDrop(done.from, done.to);
      finishCleanup(done, touched);
      return;
    }

    const after = new Map();
    for (const el of touched) after.set(el, el.getBoundingClientRect());
    for (const el of touched) {
      const a = before.get(el), b = after.get(el);
      if (!a || !b) continue;
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      const scale = el === done.item ? ' scale(1.02)' : '';
      el.style.transform = `translate3d(${dx}px,${dy}px,0)${scale}`;
      el.style.willChange = 'transform';
    }

    /* One deliberate layout read at drop time establishes the inverted frame.
       Pointer movement itself remains transform-only and layout-free. */
    void list.offsetWidth;
    if (done.to !== done.from) onDrop(done.from, done.to);
    requestAnimationFrame(() => {
      for (const el of touched) {
        el.style.transition = EASE;
        el.style.transform = '';
      }
      setTimeout(() => finishCleanup(done, touched), SETTLE_MS + 24);
    });
  }

  function finish(commit, pointerId) {
    if (!ctx || (pointerId !== undefined && pointerId !== ctx.pointerId)) return;
    const done = ctx;
    ctx = null;
    if (done.frame) cancelAnimationFrame(done.frame);
    if (done.scrollFrame) cancelAnimationFrame(done.scrollFrame);
    try { done.handle.releasePointerCapture(done.pointerId); } catch {}

    if (!done.active) return;
    if (commit && done.to !== done.from) commitWithFlip(done);
    else settleWithoutMove(done);
  }

  list.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: false });
  addEventListener('pointerup', event => finish(true, event.pointerId));
  addEventListener('pointercancel', event => finish(false, event.pointerId));
}

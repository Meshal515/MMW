export function countText(s) {
  const chars = s.length;
  const charsNoSpace = [...s].filter(c => !/\s/u.test(c)).length;
  const words = (s.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
  const sentences = (s.match(/[^.!؟?\n]+[.!؟?]+|[^.!؟?\n]+$/gm) || []).filter(x => x.trim()).length;
  return {words, chars, charsNoSpace, sentences, lines: s ? s.split('\n').length : 0};
}
export function insertHeadings(original, rawHeadings) {
  const lines = original.split('\n');
  if (!Array.isArray(rawHeadings)) throw new Error('تنسيق غير صالح');
  const headings = [];
  const seen = new Set();
  for (const h of rawHeadings.slice(0, 25)) {
    const index = Number(h.line);
    const title = String(h.title || '').replace(/[\r\n#]/g, ' ').trim().slice(0, 90);
    if (!Number.isInteger(index) || index < 1 || index > lines.length || !title || seen.has(index)) continue;
    seen.add(index);
    headings.push({line: index, title});
  }
  headings.sort((a,b) => a.line - b.line);
  const added = new Map(headings.map(h => [h.line, `\n## ${h.title}\n\n`]));
  let formatted = '';
  for (let i=0; i<lines.length; i++) {
    if (added.has(i + 1)) formatted += added.get(i + 1);
    formatted += lines[i];
    if (i < lines.length - 1) formatted += '\n';
  }
  // Provenance is maintained structurally: only prefixes are inserted before original lines.
  const restored = formatted;
  let cursor = 0, reconstructed = '';
  for (let i=0; i<lines.length; i++) {
    if (added.has(i+1)) cursor += added.get(i+1).length;
    const literal = lines[i] + (i < lines.length-1 ? '\n' : '');
    if (restored.slice(cursor, cursor+literal.length) !== literal) throw new Error('النص الأصلي تغير');
    reconstructed += restored.slice(cursor, cursor+literal.length);
    cursor += literal.length;
  }
  if (reconstructed !== original || cursor !== formatted.length) throw new Error('تعذر تأكيد سلامة النص');
  return formatted;
}
export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function markdownToHtml(text) {
  const safe = escapeHtml(text);
  return safe.split('\n').map(l => {
    const m = /^(#{1,4})\s+(.+)$/.exec(l);
    if (m) return `<h${m[1].length}>${m[2]}</h${m[1].length}>`;
    if (/^\s*[-*]\s+/.test(l)) return `<p class="markdown-li">• ${l.replace(/^\s*[-*]\s+/, '')}</p>`;
    if (/^\s*>\s?/.test(l)) return `<blockquote>${l.replace(/^\s*>\s?/, '')}</blockquote>`;
    return l.trim() ? `<p>${l}</p>` : '<div class="md-gap"></div>';
  }).join('');
}
export function fileName(name) {return String(name || 'ملاحظة').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0,80) || 'ملاحظة';}

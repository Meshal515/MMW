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
function markdownInline(value) {
  // Escape source before adding our own trusted markup; never emit user HTML.
  return escapeHtml(value)
    .replace(/\x60([^\x60\n]+)\x60/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
}
function tableCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => x.trim());
}
function isTableSeparator(line) {
  return tableCells(line).every(cell => /^:?-{3,}:?$/.test(cell));
}
export function markdownToHtml(text) {
  const lines = String(text).split('\n');
  const output = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).replace(/[^a-z0-9_-]/gi, '').slice(0, 24);
      const code = [];
      while (++i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i]);
      output.push('<pre class="md-code"><code'+(language ? ' data-language="'+language+'"' : '')+'>'+escapeHtml(code.join('\n'))+'</code></pre>');
      continue;
    }
    if (i + 1 < lines.length && line.includes('|') && lines[i+1].includes('|') && isTableSeparator(lines[i+1])) {
      const headings = tableCells(line);
      const separator = tableCells(lines[i+1]);
      if (headings.length === separator.length && headings.length > 1) {
        const rows = [];
        i += 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          const cells = tableCells(lines[i]);
          rows.push('<tr>'+headings.map((_,index)=>'<td>'+markdownInline(cells[index] || '')+'</td>').join('')+'</tr>');
          i++;
        }
        i--;
        output.push('<div class="md-table-scroll"><table><thead><tr>'+headings.map(c=>'<th>'+markdownInline(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>');
        continue;
      }
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {const n=heading[1].length;output.push('<h'+n+'>'+markdownInline(heading[2])+'</h'+n+'>');continue;}
    if (/^\s*[-*]\s+/.test(line)) {output.push('<p class="markdown-li">• '+markdownInline(line.replace(/^\s*[-*]\s+/, ''))+'</p>');continue;}
    if (/^\s*\d+\.\s+/.test(line)) {output.push('<p class="markdown-li">'+markdownInline(line.trim())+'</p>');continue;}
    if (/^\s*>\s?/.test(line)) {output.push('<blockquote>'+markdownInline(line.replace(/^\s*>\s?/, ''))+'</blockquote>');continue;}
    output.push(line.trim()?'<p>'+markdownInline(line)+'</p>':'<div class="md-gap"></div>');
  }
  return output.join('');
}
export function fileName(name) {return String(name || 'ملاحظة').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0,80) || 'ملاحظة';}

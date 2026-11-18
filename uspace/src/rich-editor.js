/**
 * USPACE rich document adapter.
 *
 * Rich JSON is the lossless local representation. Markdown is a portable
 * interchange representation; styles unsupported by Markdown stay in richDoc.
 * No API keys or documents are sent to third-party editor services.
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TextAlign } from '@tiptap/extension-text-align';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Highlight } from '@tiptap/extension-highlight';

export function mountRichEditor(element, onUpdate, onSelection) {
  return new Editor({
    element,
    extensions: [
      StarterKit,
      Markdown.configure({markedOptions:{gfm:true,breaks:false}}),
      TableKit.configure({table:{resizable:true,HTMLAttributes:{class:'us-rich-table'}}}),
      TextStyleKit,
      TextAlign.configure({types:['paragraph','heading']}),
      TaskList,
      TaskItem.configure({nested:true}),
      Highlight.configure({multicolor:true})
    ],
    content:'<p></p>',
    editorProps:{
      attributes:{
        class:'tiptap us-rich-document',
        dir:'auto',
        lang:'ar',
        spellcheck:'true',
        role:'textbox',
        'aria-label':'محرر المستند المنسق',
        'aria-multiline':'true'
      }
    },
    onUpdate:({editor})=>onUpdate?.(editor),
    onSelectionUpdate:({editor})=>onSelection?.(editor)
  });
}
export function loadRichDocument(editor, page) {
  if (!editor) return;
  const source=String(page?.body||'');
  const rich=page?.richDoc;
  if (rich && typeof rich==='object' && rich.type==='doc') {
    try {
      editor.commands.setContent(rich,{emitUpdate:false});
      return;
    } catch { /* Fall back to unmodified Markdown source. */ }
  }
  editor.commands.setContent(source,{contentType:'markdown',emitUpdate:false});
}
export const richMarkdown=editor=>editor.getMarkdown();
export const richJSON=editor=>editor.getJSON();
export const richHTML=editor=>editor.getHTML();

/**
 * Only invokes explicit, schema-supported editor operations.
 * Actions involving the clipboard or arbitrary pasted markup are not used.
 */
export function richAction(editor,action,args={}) {
  if(!editor)return false;
  const chain=()=>editor.chain().focus();
  switch(action){
    case 'undo':return chain().undo().run();
    case 'redo':return chain().redo().run();
    case 'bold':return chain().toggleBold().run();
    case 'italic':return chain().toggleItalic().run();
    case 'underline':return chain().toggleUnderline().run();
    case 'strike':return chain().toggleStrike().run();
    case 'code':return chain().toggleCode().run();
    case 'codeblock':return chain().toggleCodeBlock().run();
    case 'heading':return chain().toggleHeading({level:2}).run();
    case 'h1':return chain().toggleHeading({level:1}).run();
    case 'h2':return chain().toggleHeading({level:2}).run();
    case 'h3':return chain().toggleHeading({level:3}).run();
    case 'paragraph':return chain().setParagraph().run();
    case 'list':return chain().toggleBulletList().run();
    case 'ordered':return chain().toggleOrderedList().run();
    case 'checklist':return chain().toggleTaskList().run();
    case 'quote':return chain().toggleBlockquote().run();
    case 'hr':return chain().setHorizontalRule().run();
    case 'highlight':return chain().toggleHighlight().run();
    case 'align-right':return chain().setTextAlign('right').run();
    case 'align-left':return chain().setTextAlign('left').run();
    case 'align-center':return chain().setTextAlign('center').run();
    case 'align-justify':return chain().setTextAlign('justify').run();
    case 'set-font':return chain().setFontFamily(args.value).run();
    case 'set-size':return chain().setFontSize(String(args.value)+'px').run();
    case 'set-color':return chain().setColor(args.value).run();
    case 'set-background':return chain().setBackgroundColor(args.value).run();
    case 'unset-format':return chain().unsetAllMarks().run();
    case 'link':return chain().setLink({href:args.href, target:'_blank', rel:'noopener noreferrer nofollow'}).run();
    case 'unlink':return chain().unsetLink().run();
    case 'table':return chain().insertTable({rows:args.rows||3,cols:args.cols||3,withHeaderRow:true}).run();
    case 'row-before':return chain().addRowBefore().run();
    case 'row-after':return chain().addRowAfter().run();
    case 'row-remove':return chain().deleteRow().run();
    case 'col-before':return chain().addColumnBefore().run();
    case 'col-after':return chain().addColumnAfter().run();
    case 'col-remove':return chain().deleteColumn().run();
    case 'merge':return chain().mergeCells().run();
    case 'split':return chain().splitCell().run();
    case 'header-row':return chain().toggleHeaderRow().run();
    case 'header-column':return chain().toggleHeaderColumn().run();
    case 'table-remove':return chain().deleteTable().run();
    default:return false;
  }
}
export function selectionFormatting(editor) {
  if(!editor)return {};
  return {
    table:editor.isActive('table'),
    bold:editor.isActive('bold'),
    italic:editor.isActive('italic'),
    underline:editor.isActive('underline'),
    strike:editor.isActive('strike'),
    code:editor.isActive('code'),
    bullet:editor.isActive('bulletList'),
    ordered:editor.isActive('orderedList'),
    task:editor.isActive('taskList'),
    quote:editor.isActive('blockquote'),
    heading:editor.isActive('heading'),
    textStyle:editor.getAttributes('textStyle')
  };
}

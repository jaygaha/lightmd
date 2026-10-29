// Read-only CodeMirror 6 source pane.
// `npm run build` bundles it to vendor/source-view.js (window.LightMDSource); loaded on first use.

import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { tags } from '@lezer/highlight';

// CSS variables, so the pane follows light/dark mode.
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--src-heading)', fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--src-link)' },
  { tag: tags.monospace, color: 'var(--src-code)' },
  { tag: tags.quote, color: 'var(--muted)' },
  // markup: # * ` > [ ] list markers, ---
  { tag: [tags.processingInstruction, tags.contentSeparator], color: 'var(--src-marker)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--fg)', backgroundColor: 'var(--bg)', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.6' },
  '.cm-content': { padding: '16px 16px 64px 4px' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--muted)', border: 'none', paddingLeft: '8px' },
});

export function createSourceView(host) {
  let topLineListener = null;
  let frame = 0;
  function notifyTopLine() {
    if (frame) return; // once per frame
    frame = requestAnimationFrame(() => {
      frame = 0;
      topLineListener?.(topLine());
    });
  }

  // In a shadow root CodeMirror uses constructable stylesheets,
  // which the CSP allows (a <style> tag would be blocked). CSS variables still inherit.
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  root.replaceChildren(); // a retry after a failed mount starts clean

  const view = new EditorView({
    root,
    parent: root,
    state: EditorState.create({
      doc: '',
      extensions: [
        EditorState.readOnly.of(true), // selectable and searchable, not editable
        lineNumbers(),
        EditorView.lineWrapping,
        markdown(),
        syntaxHighlighting(markdownHighlight),
        search(), // panel at the bottom, clear of the view toolbar
        highlightSelectionMatches(),
        keymap.of(searchKeymap),
        // Re-measured line heights move the top line without a scroll event.
        EditorView.updateListener.of((update) => {
          if (update.geometryChanged) notifyTopLine();
        }),
        theme,
      ],
    }),
  });

  // Fractional top line (12.5 = halfway through 12) for smooth sync.
  function topLine() {
    const y = Math.max(0, view.scrollDOM.getBoundingClientRect().top - view.documentTop);
    const block = view.lineBlockAtHeight(y);
    const line = view.state.doc.lineAt(block.from).number;
    return line + Math.min(1, Math.max(0, (y - block.top) / (block.height || 1)));
  }

  view.scrollDOM.addEventListener('scroll', notifyTopLine, { passive: true });

  return {
    // Live reload keeps the same line at the top; a different file starts at line 1.
    // (A scrollSnapshot would hold a character offset into the old text, which lands on another line once text above it changes.)
    setText(text, { keepScroll = true } = {}) {
      const unchanged = text === view.state.doc.toString();
      if (unchanged && keepScroll) return;
      const line = keepScroll ? Math.floor(topLine() + 0.01) : 1; // 144.99 means line 145
      if (!unchanged) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      const { doc } = view.state;
      const pos = doc.line(Math.min(line, doc.lines)).from;
      view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 0 }) });
    },
    focus() {
      view.focus();
    },
    onTopLineChange(listener) {
      topLineListener = listener;
    },
    topLine,
  };
}

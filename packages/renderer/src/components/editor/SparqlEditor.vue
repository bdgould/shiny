<template>
  <div ref="editorContainer" class="editor-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { useQueryStore } from '@/stores/query';

const editorContainer = ref<HTMLElement | null>(null);
const queryStore = useQueryStore();
let editorView: EditorView | null = null;

// Detect if user prefers dark mode
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

// Custom syntax highlighting colors
const customHighlightStyle = HighlightStyle.define([
  // Keywords (SELECT, WHERE, FILTER, etc.)
  { tag: tags.keyword, color: prefersDark ? '#c586c0' : '#af00db' },

  // String literals and URIs in angle brackets
  { tag: tags.string, color: prefersDark ? '#ce9178' : '#a31515' },
  { tag: tags.angleBracket, color: prefersDark ? '#ce9178' : '#a31515' },

  // Property names (for prefixed names like dbo:, dbr:)
  { tag: tags.propertyName, color: prefersDark ? '#9cdcfe' : '#0070c1' },

  // Variables (?city, ?population)
  { tag: tags.variableName, color: prefersDark ? '#4fc1ff' : '#001080' },

  // Numbers
  { tag: tags.number, color: prefersDark ? '#b5cea8' : '#098658' },

  // Operators and punctuation
  { tag: tags.operator, color: prefersDark ? '#d4d4d4' : '#333333' },
  { tag: tags.punctuation, color: prefersDark ? '#d4d4d4' : '#333333' },

  // Comments
  { tag: tags.comment, color: prefersDark ? '#6a9955' : '#008000', fontStyle: 'italic' },

  // Default text (fallback)
  { tag: tags.content, color: prefersDark ? '#d4d4d4' : '#1a1a1a' },
]);

// Custom theme for CodeMirror that matches our app theme
const customTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
    backgroundColor: prefersDark ? '#1e1e1e' : '#ffffff',
    color: prefersDark ? '#d4d4d4' : '#1a1a1a', // Lighter default text color
  },
  '.cm-content': {
    caretColor: prefersDark ? '#d4d4d4' : '#1a1a1a',
    padding: '8px 0',
  },
  '.cm-scroller': {
    fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", monospace',
    lineHeight: '1.6',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-line': {
    padding: '0 8px',
  },
  '.cm-activeLine': {
    backgroundColor: prefersDark ? '#2a2a2a' : '#f0f0f0',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: prefersDark ? '#264f78' : '#b3d4fc',
  },
  '.cm-gutters': {
    backgroundColor: prefersDark ? '#252526' : '#f5f5f5',
    color: prefersDark ? '#858585' : '#666666',
    border: 'none',
    borderRight: `1px solid ${prefersDark ? '#3c3c3c' : '#e0e0e0'}`,
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px',
    minWidth: '40px',
    color: prefersDark ? '#858585' : '#666666',
  },
  '.cm-activeLineGutter': {
    backgroundColor: prefersDark ? '#2a2a2a' : '#f0f0f0',
  },
  '.cm-cursor': {
    borderLeftColor: prefersDark ? '#d4d4d4' : '#1a1a1a',
  },
}, { dark: prefersDark });

onMounted(() => {
  if (!editorContainer.value) return;

  const startState = EditorState.create({
    doc: queryStore.currentQuery,
    extensions: [
      basicSetup,
      javascript(), // Using JavaScript for now, will add SPARQL later
      customTheme,
      syntaxHighlighting(customHighlightStyle),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          queryStore.setQuery(update.state.doc.toString());
        }
      }),
    ],
  });

  editorView = new EditorView({
    state: startState,
    parent: editorContainer.value,
  });
});

// Watch for external changes to the query
watch(() => queryStore.currentQuery, (newQuery) => {
  if (editorView && editorView.state.doc.toString() !== newQuery) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newQuery,
      },
    });
  }
});
</script>

<style scoped>
.editor-container {
  flex: 1;
  overflow: hidden;
  background: var(--color-bg-editor);
}

:deep(.cm-editor) {
  height: 100%;
}

:deep(.cm-scroller) {
  overflow: auto;
}
</style>

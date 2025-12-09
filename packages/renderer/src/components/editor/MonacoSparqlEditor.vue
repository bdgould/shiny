<template>
  <div ref="editorContainer" class="monaco-editor-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useQueryStore } from '@/stores/query'
import { useTabsStore } from '@/stores/tabs'
import { Parser } from 'sparqljs'

const editorContainer = ref<HTMLElement | null>(null)
const queryStore = useQueryStore()
const tabsStore = useTabsStore()

let editor: monaco.editor.IStandaloneCodeEditor | null = null
const modelCache = new Map<string, monaco.editor.ITextModel>()

// Detect if user prefers dark mode
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

// Register SPARQL language with Monaco
monaco.languages.register({ id: 'sparql' })

// SPARQL Monarch tokenizer
monaco.languages.setMonarchTokensProvider('sparql', {
  defaultToken: '',
  tokenPostfix: '.sparql',
  ignoreCase: true,

  keywords: [
    'SELECT',
    'CONSTRUCT',
    'DESCRIBE',
    'ASK',
    'WHERE',
    'FROM',
    'NAMED',
    'PREFIX',
    'BASE',
    'DISTINCT',
    'REDUCED',
    'ORDER',
    'BY',
    'LIMIT',
    'OFFSET',
    'OPTIONAL',
    'GRAPH',
    'UNION',
    'FILTER',
    'BIND',
    'VALUES',
    'SERVICE',
    'MINUS',
    'EXISTS',
    'NOT',
    'IN',
    'AS',
    'GROUP',
    'HAVING',
    'ASC',
    'DESC',
    'COUNT',
    'SUM',
    'MIN',
    'MAX',
    'AVG',
    'SAMPLE',
    'GROUP_CONCAT',
    'SEPARATOR',
    'STR',
    'LANG',
    'LANGMATCHES',
    'DATATYPE',
    'BOUND',
    'IRI',
    'URI',
    'BNODE',
    'RAND',
    'ABS',
    'CEIL',
    'FLOOR',
    'ROUND',
    'CONCAT',
    'STRLEN',
    'UCASE',
    'LCASE',
    'ENCODE_FOR_URI',
    'CONTAINS',
    'STRSTARTS',
    'STRENDS',
    'STRBEFORE',
    'STRAFTER',
    'YEAR',
    'MONTH',
    'DAY',
    'HOURS',
    'MINUTES',
    'SECONDS',
    'TIMEZONE',
    'TZ',
    'NOW',
    'UUID',
    'STRUUID',
    'MD5',
    'SHA1',
    'SHA256',
    'SHA384',
    'SHA512',
    'COALESCE',
    'IF',
    'STRLANG',
    'STRDT',
    'SAMETERM',
    'ISIRI',
    'ISURI',
    'ISBLANK',
    'ISLITERAL',
    'ISNUMERIC',
    'REGEX',
    'SUBSTR',
    'REPLACE',
    'a',
  ],

  operators: ['=', '!=', '<', '>', '<=', '>=', '&&', '||', '!', '+', '-', '*', '/', '^'],

  // Define token patterns
  tokenizer: {
    root: [
      // Whitespace
      { include: '@whitespace' },

      // Variables
      [/[?$][a-zA-Z_]\w*/, 'variable'],

      // IRIs in angle brackets
      [/<[^>]+>/, 'string.iri'],

      // Prefixed names (prefix:localName)
      [/[a-zA-Z_][\w-]*:[a-zA-Z_][\w-]*/, 'type.identifier'],

      // Keywords
      [
        /[a-zA-Z_]\w*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        },
      ],

      // Strings (single and double quotes)
      [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-terminated string
      [/'([^'\\]|\\.)*$/, 'string.invalid'], // non-terminated string
      [/"/, 'string', '@string_double'],
      [/'/, 'string', '@string_single'],

      // Numbers
      [/\d+\.\d+([eE][-+]?\d+)?/, 'number.float'],
      [/\d+/, 'number'],

      // Operators
      [/[=!<>]=?/, 'operator'],
      [/[+\-*/^]/, 'operator'],
      [/&&|\|\|/, 'operator'],

      // Delimiters
      [/[{}()[\]]/, '@brackets'],
      [/[;,.]/, 'delimiter'],
    ],

    whitespace: [
      [/[ \t\r\n]+/, ''],
      [/#.*$/, 'comment'],
    ],

    string_double: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],

    string_single: [
      [/[^\\']+/, 'string'],
      [/\\./, 'string.escape'],
      [/'/, 'string', '@pop'],
    ],
  },
})

// Define SPARQL theme colors
monaco.editor.defineTheme('sparql-theme-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'c586c0', fontStyle: 'bold' },
    { token: 'variable', foreground: '4fc1ff' },
    { token: 'string.iri', foreground: 'ce9178' },
    { token: 'type.identifier', foreground: '9cdcfe' },
    { token: 'string', foreground: 'ce9178' },
    { token: 'number', foreground: 'b5cea8' },
    { token: 'operator', foreground: 'd4d4d4' },
    { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
  ],
  colors: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#d4d4d4',
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#c6c6c6',
    'editor.lineHighlightBackground': '#2a2a2a',
    'editor.selectionBackground': '#264f78',
    'editorCursor.foreground': '#d4d4d4',
  },
})

monaco.editor.defineTheme('sparql-theme-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'af00db', fontStyle: 'bold' },
    { token: 'variable', foreground: '001080' },
    { token: 'string.iri', foreground: 'a31515' },
    { token: 'type.identifier', foreground: '0070c1' },
    { token: 'string', foreground: 'a31515' },
    { token: 'number', foreground: '098658' },
    { token: 'operator', foreground: '333333' },
    { token: 'comment', foreground: '008000', fontStyle: 'italic' },
  ],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#1a1a1a',
    'editorLineNumber.foreground': '#666666',
    'editorLineNumber.activeForeground': '#333333',
    'editor.lineHighlightBackground': '#f0f0f0',
    'editor.selectionBackground': '#b3d4fc',
    'editorCursor.foreground': '#1a1a1a',
  },
})

// Register IntelliSense completion provider
monaco.languages.registerCompletionItemProvider('sparql', {
  provideCompletionItems: (model, position) => {
    const word = model.getWordUntilPosition(position)
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    }

    // SPARQL keywords
    const keywords = [
      { label: 'SELECT', kind: monaco.languages.CompletionItemKind.Keyword, detail: 'Query form' },
      {
        label: 'CONSTRUCT',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Query form',
      },
      {
        label: 'DESCRIBE',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Query form',
      },
      { label: 'ASK', kind: monaco.languages.CompletionItemKind.Keyword, detail: 'Query form' },
      {
        label: 'WHERE',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Graph pattern',
      },
      {
        label: 'FROM',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Dataset clause',
      },
      { label: 'NAMED', kind: monaco.languages.CompletionItemKind.Keyword, detail: 'Named graph' },
      {
        label: 'PREFIX',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Namespace prefix',
        insertText: 'PREFIX ${1:prefix}: <${2:http://example.org/}>',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      { label: 'BASE', kind: monaco.languages.CompletionItemKind.Keyword, detail: 'Base IRI' },
      {
        label: 'DISTINCT',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Remove duplicates',
      },
      {
        label: 'REDUCED',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Permit duplicates',
      },
      {
        label: 'ORDER BY',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Sort results',
        insertText: 'ORDER BY ${1:?var}',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'LIMIT',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Limit results',
        insertText: 'LIMIT ${1:10}',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'OFFSET',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Skip results',
        insertText: 'OFFSET ${1:0}',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'OPTIONAL',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Optional pattern',
      },
      {
        label: 'GRAPH',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Named graph pattern',
      },
      {
        label: 'UNION',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Alternative patterns',
      },
      {
        label: 'FILTER',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Filter results',
        insertText: 'FILTER (${1:?var} ${2:=} ${3:value})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'BIND',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Bind variable',
        insertText: 'BIND (${1:expression} AS ${2:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      { label: 'VALUES', kind: monaco.languages.CompletionItemKind.Keyword, detail: 'Inline data' },
      {
        label: 'SERVICE',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Federated query',
      },
      {
        label: 'MINUS',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Remove matches',
      },
      {
        label: 'EXISTS',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Test existence',
      },
      {
        label: 'NOT EXISTS',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Test non-existence',
        insertText: 'NOT EXISTS',
      },
      {
        label: 'GROUP BY',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Group results',
        insertText: 'GROUP BY ${1:?var}',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'HAVING',
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'Filter groups',
      },
      { label: 'AS', kind: monaco.languages.CompletionItemKind.Keyword, detail: 'Alias' },
    ]

    // SPARQL aggregate functions
    const aggregates = [
      {
        label: 'COUNT',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Count values',
        insertText: 'COUNT(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'SUM',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Sum values',
        insertText: 'SUM(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'MIN',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Minimum value',
        insertText: 'MIN(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'MAX',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Maximum value',
        insertText: 'MAX(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'AVG',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Average value',
        insertText: 'AVG(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'SAMPLE',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Sample value',
        insertText: 'SAMPLE(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'GROUP_CONCAT',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Concatenate values',
        insertText: 'GROUP_CONCAT(${1:?var}; SEPARATOR="${2:,}")',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
    ]

    // SPARQL built-in functions
    const functions = [
      {
        label: 'STR',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Convert to string',
        insertText: 'STR(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'LANG',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Get language tag',
        insertText: 'LANG(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'LANGMATCHES',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Match language tag',
        insertText: 'LANGMATCHES(${1:?lang}, "${2:en}")',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'DATATYPE',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Get datatype',
        insertText: 'DATATYPE(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'BOUND',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Test if bound',
        insertText: 'BOUND(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'IRI',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Create IRI',
        insertText: 'IRI(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'URI',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Create URI',
        insertText: 'URI(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'BNODE',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Create blank node',
        insertText: 'BNODE()',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'CONCAT',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Concatenate strings',
        insertText: 'CONCAT(${1:?var1}, ${2:?var2})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'STRLEN',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'String length',
        insertText: 'STRLEN(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'UCASE',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Uppercase',
        insertText: 'UCASE(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'LCASE',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Lowercase',
        insertText: 'LCASE(${1:?var})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'CONTAINS',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'String contains',
        insertText: 'CONTAINS(${1:?var}, "${2:text}")',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'STRSTARTS',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'String starts with',
        insertText: 'STRSTARTS(${1:?var}, "${2:text}")',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'STRENDS',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'String ends with',
        insertText: 'STRENDS(${1:?var}, "${2:text}")',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'REGEX',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Regular expression',
        insertText: 'REGEX(${1:?var}, "${2:pattern}")',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'REPLACE',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Replace string',
        insertText: 'REPLACE(${1:?var}, "${2:pattern}", "${3:replacement}")',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'IF',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Conditional',
        insertText: 'IF(${1:condition}, ${2:true}, ${3:false})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'COALESCE',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'First non-null',
        insertText: 'COALESCE(${1:?var1}, ${2:?var2})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'NOW',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Current datetime',
        insertText: 'NOW()',
      },
      {
        label: 'YEAR',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Extract year',
        insertText: 'YEAR(${1:?date})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'MONTH',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Extract month',
        insertText: 'MONTH(${1:?date})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
      {
        label: 'DAY',
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Extract day',
        insertText: 'DAY(${1:?date})',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      },
    ]

    // Common RDF prefixes
    const prefixes = [
      {
        label: 'rdf:',
        kind: monaco.languages.CompletionItemKind.Module,
        detail: 'RDF vocabulary',
        documentation: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      },
      {
        label: 'rdfs:',
        kind: monaco.languages.CompletionItemKind.Module,
        detail: 'RDF Schema',
        documentation: 'http://www.w3.org/2000/01/rdf-schema#',
      },
      {
        label: 'owl:',
        kind: monaco.languages.CompletionItemKind.Module,
        detail: 'OWL vocabulary',
        documentation: 'http://www.w3.org/2002/07/owl#',
      },
      {
        label: 'xsd:',
        kind: monaco.languages.CompletionItemKind.Module,
        detail: 'XML Schema datatypes',
        documentation: 'http://www.w3.org/2001/XMLSchema#',
      },
      {
        label: 'foaf:',
        kind: monaco.languages.CompletionItemKind.Module,
        detail: 'Friend of a Friend',
        documentation: 'http://xmlns.com/foaf/0.1/',
      },
      {
        label: 'dc:',
        kind: monaco.languages.CompletionItemKind.Module,
        detail: 'Dublin Core',
        documentation: 'http://purl.org/dc/elements/1.1/',
      },
      {
        label: 'dct:',
        kind: monaco.languages.CompletionItemKind.Module,
        detail: 'Dublin Core Terms',
        documentation: 'http://purl.org/dc/terms/',
      },
      {
        label: 'skos:',
        kind: monaco.languages.CompletionItemKind.Module,
        detail: 'SKOS vocabulary',
        documentation: 'http://www.w3.org/2004/02/skos/core#',
      },
      {
        label: 'dbo:',
        kind: monaco.languages.CompletionItemKind.Module,
        detail: 'DBpedia Ontology',
        documentation: 'http://dbpedia.org/ontology/',
      },
      {
        label: 'dbr:',
        kind: monaco.languages.CompletionItemKind.Module,
        detail: 'DBpedia Resource',
        documentation: 'http://dbpedia.org/resource/',
      },
      {
        label: 'schema:',
        kind: monaco.languages.CompletionItemKind.Module,
        detail: 'Schema.org',
        documentation: 'http://schema.org/',
      },
    ]

    const suggestions = [...keywords, ...aggregates, ...functions, ...prefixes].map((item) => ({
      ...item,
      range,
    }))

    return { suggestions }
  },
})

// SPARQL validation using sparqljs
const parser = new Parser()

function validateSparql(model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const query = model.getValue()

  if (!query.trim()) {
    return markers
  }

  try {
    parser.parse(query)
  } catch (error: any) {
    // Extract error details from sparqljs parser
    const errorMessage = error.message || 'Syntax error'
    let line = 1
    let column = 1

    // Try to extract line and column from error message
    const locationMatch = errorMessage.match(/line (\d+) column (\d+)/i)
    if (locationMatch) {
      line = parseInt(locationMatch[1], 10)
      column = parseInt(locationMatch[2], 10)
    } else {
      // Try to parse error.hash if available
      if (error.hash && typeof error.hash.line === 'number') {
        line = error.hash.line
        column = error.hash.loc?.first_column || 1
      }
    }

    markers.push({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: line,
      startColumn: column,
      endLineNumber: line,
      endColumn: column + 1,
      message: errorMessage,
    })
  }

  return markers
}

// Register validation on model changes
monaco.editor.onDidCreateModel((model) => {
  if (model.getLanguageId() === 'sparql') {
    // Validate immediately
    const markers = validateSparql(model)
    monaco.editor.setModelMarkers(model, 'sparql', markers)

    // Validate on content change with debounce
    let validationTimeout: ReturnType<typeof setTimeout>
    model.onDidChangeContent(() => {
      clearTimeout(validationTimeout)
      validationTimeout = setTimeout(() => {
        const newMarkers = validateSparql(model)
        monaco.editor.setModelMarkers(model, 'sparql', newMarkers)
      }, 500) // 500ms debounce
    })
  }
})

// Function to get or create model for a tab
function getOrCreateModel(tabId: string, query: string): monaco.editor.ITextModel {
  let model = modelCache.get(tabId)

  if (!model) {
    // Create new model for this tab
    model = monaco.editor.createModel(query, 'sparql')

    // Set up validation for this model
    model.onDidChangeContent(() => {
      const markers = validateSparql(model)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      monaco.editor.setModelMarkers(model!, 'sparql', markers)
    })

    modelCache.set(tabId, model)
  }

  return model
}

// Function to switch to a tab's model
function switchToTabModel(tabId: string) {
  if (!editor) return

  const tab = tabsStore.getTab(tabId)
  if (!tab) return

  const model = getOrCreateModel(tabId, tab.query)
  editor.setModel(model)
}

onMounted(() => {
  if (!editorContainer.value) return

  // Create editor without a model initially
  editor = monaco.editor.create(editorContainer.value, {
    model: null, // We'll set the model separately
    language: 'sparql',
    theme: prefersDark ? 'sparql-theme-dark' : 'sparql-theme-light',
    fontSize: 14,
    fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", monospace',
    lineHeight: 1.6,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'on',
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    padding: { top: 8, bottom: 8 },
  })

  // Set the model for the active tab
  if (tabsStore.activeTabId) {
    switchToTabModel(tabsStore.activeTabId)
  }

  // Sync editor changes to store (updates the active tab)
  editor.onDidChangeModelContent(() => {
    if (editor && tabsStore.activeTab) {
      const currentValue = editor.getValue()
      // Only update if different to avoid circular updates
      if (currentValue !== tabsStore.activeTab.query) {
        tabsStore.updateTabQuery(tabsStore.activeTab.id, currentValue)
      }
    }
  })

  // Register keyboard shortcut: Cmd+Enter (Mac) or Ctrl+Enter (Win/Linux) to execute query
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    queryStore.executeQuery()
  })

  // Register keyboard shortcut: Cmd+S (Mac) or Ctrl+S (Win/Linux) to save query
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
    const { useFileOperations } = await import('@/composables/useFileOperations')
    const { saveQuery } = useFileOperations()
    await saveQuery()
  })

  // Register keyboard shortcut: Cmd+O (Mac) or Ctrl+O (Win/Linux) to open query
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO, async () => {
    const { useFileOperations } = await import('@/composables/useFileOperations')
    const { openQuery } = useFileOperations()
    await openQuery()
  })

  // Watch for tab switches and update the editor model
  watch(
    () => tabsStore.activeTabId,
    (newTabId) => {
      if (newTabId) {
        switchToTabModel(newTabId)
      }
    }
  )
})

onUnmounted(() => {
  // Dispose all cached models
  modelCache.forEach((model) => model.dispose())
  modelCache.clear()

  // Dispose the editor
  editor?.dispose()
})
</script>

<style scoped>
.monaco-editor-container {
  flex: 1;
  overflow: hidden;
  background: var(--color-bg-editor);
}
</style>

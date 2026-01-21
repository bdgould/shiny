<template>
  <div ref="editorContainer" class="monaco-editor-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useQueryStore } from '@/stores/query'
import { useTabsStore } from '@/stores/tabs'
import { useOntologyCacheStore } from '@/stores/ontologyCache'
import { useConnectionStore } from '@/stores/connection'
import { getCacheSettings, getSparqlFormattingSettings } from '@/services/preferences/appSettings'
import { Parser } from 'sparqljs'
import { formatSparqlQuery } from '@/services/sparql/sparqlFormatter'

const editorContainer = ref<HTMLElement | null>(null)
const queryStore = useQueryStore()
const tabsStore = useTabsStore()
const cacheStore = useOntologyCacheStore()
const connectionStore = useConnectionStore()

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

/**
 * Parse PREFIX declarations from SPARQL query
 */
function parsePrefixes(queryText: string): Map<string, string> {
  const prefixMap = new Map<string, string>()
  const prefixRegex = /PREFIX\s+(\w+):\s*<([^>]+)>/gi
  let match

  while ((match = prefixRegex.exec(queryText)) !== null) {
    prefixMap.set(match[1], match[2])
  }

  return prefixMap
}

/**
 * Expand prefixed name to full IRI
 */
function expandPrefixedName(prefixedName: string, prefixes: Map<string, string>): string | null {
  const colonIndex = prefixedName.indexOf(':')
  if (colonIndex === -1) return null

  const prefix = prefixedName.substring(0, colonIndex)
  const localName = prefixedName.substring(colonIndex + 1)
  const namespace = prefixes.get(prefix)

  if (!namespace) return null
  return namespace + localName
}

/**
 * Compress full IRI to prefixed name if possible
 */
function compressIRI(iri: string, prefixes: Map<string, string>): string {
  for (const [prefix, namespace] of prefixes.entries()) {
    if (iri.startsWith(namespace)) {
      const localName = iri.substring(namespace.length)
      return `${prefix}:${localName}`
    }
  }
  return `<${iri}>`
}

/**
 * Detect context: are we in subject, predicate, or object position?
 */
function detectContext(
  model: monaco.editor.ITextModel,
  position: monaco.Position
): 'subject' | 'predicate' | 'object' | 'unknown' {
  const lineContent = model.getLineContent(position.lineNumber)
  const beforeCursor = lineContent.substring(0, position.column - 1)

  // Look back for triple pattern structure
  const triplePattern = beforeCursor.trim()

  // Count elements (subject predicate object .)
  // Simple heuristic: count spaces and special characters
  const parts = triplePattern.split(/\s+/)
  const lastPart = parts[parts.length - 1]

  // After 'a' or 'rdf:type' = class suggestion (object position for type)
  if (
    parts.length >= 2 &&
    (parts[parts.length - 2] === 'a' || parts[parts.length - 2].match(/rdf:type|<.*type>/))
  ) {
    return 'object' // Actually want classes here
  }

  // Count semicolons and periods for more complex patterns
  const semicolons = (triplePattern.match(/;/g) || []).length
  const periods = (triplePattern.match(/\./g) || []).length

  // After opening brace or period = subject position
  if (triplePattern.match(/\{\s*$/) || triplePattern.match(/\.\s*$/)) {
    return 'subject'
  }

  // Simple position detection based on elements in current statement
  const inCurrentStatement = triplePattern.split(/[.;]/).pop() || ''
  const elementsInStatement = inCurrentStatement
    .trim()
    .split(/\s+/)
    .filter((e) => e && !e.match(/^\{/))

  if (elementsInStatement.length === 0 || elementsInStatement.length === 1) {
    return 'subject'
  } else if (elementsInStatement.length === 2) {
    return 'predicate'
  } else {
    return 'object'
  }
}

// Register IntelliSense completion provider
monaco.languages.registerCompletionItemProvider('sparql', {
  provideCompletionItems: async (model, position) => {
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

    // Combine static suggestions
    const staticSuggestions = [...keywords, ...aggregates, ...functions, ...prefixes].map(
      (item) => ({
        ...item,
        range,
      })
    )

    // Get ontology suggestions from cache
    const ontologySuggestions = await getOntologySuggestions(model, position, range)

    return { suggestions: [...staticSuggestions, ...ontologySuggestions] }
  },
})

/**
 * Get ontology-based completion suggestions from cache
 */
async function getOntologySuggestions(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  range: monaco.IRange
): Promise<monaco.languages.CompletionItem[]> {
  const suggestions: monaco.languages.CompletionItem[] = []

  // Check if autocomplete is enabled
  const settings = getCacheSettings()
  if (!settings.enableAutocomplete) {
    return suggestions
  }

  // Get current backend
  const activeTab = tabsStore.activeTab
  if (!activeTab || !activeTab.backendId) {
    return suggestions
  }

  const backendId = activeTab.backendId

  // Check if cache exists
  const validation = await cacheStore.validateCache(backendId)
  if (!validation.exists) {
    return suggestions
  }

  // Parse prefixes from query
  const queryText = model.getValue()
  const prefixes = parsePrefixes(queryText)

  // Detect context
  const context = detectContext(model, position)
  const word = model.getWordUntilPosition(position)
  const wordText = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: word.endColumn,
  })

  // Determine if user is typing full IRI or prefixed name
  const isTypingFullIRI = wordText.startsWith('<')
  const isTypingPrefixed = wordText.includes(':') && !isTypingFullIRI

  // Search cache based on context
  try {
    const searchQuery = isTypingFullIRI ? wordText.substring(1) : wordText

    // Determine which types to search based on context
    let types: Array<'class' | 'property' | 'individual'> = []

    if (context === 'predicate') {
      types = ['property']
    } else if (context === 'object' && wordText.trim()) {
      // After 'a' or 'rdf:type', suggest classes
      const lineContent = model.getLineContent(position.lineNumber)
      const beforeWord = lineContent.substring(0, word.startColumn - 1)
      if (beforeWord.match(/\s+a\s+$/) || beforeWord.match(/rdf:type\s+$/)) {
        types = ['class']
      } else {
        // General object position: could be individual or class
        types = ['individual', 'class']
      }
    } else if (context === 'subject') {
      types = ['individual', 'class']
    } else {
      // Unknown context: suggest everything
      types = ['class', 'property', 'individual']
    }

    const results = await cacheStore.searchElements(backendId, {
      query: searchQuery,
      types,
      limit: 20,
      caseSensitive: false,
      prefixOnly: false,
    })

    // Convert search results to Monaco completion items
    for (const result of results) {
      const element = result.element

      // Determine insert text (prefixed or full IRI)
      let insertText: string
      let label: string

      if (isTypingFullIRI) {
        // User wants full IRI
        insertText = `<${element.iri}>`
        label = element.iri
      } else {
        // Try to use prefixed name
        const prefixedName = compressIRI(element.iri, prefixes)
        if (prefixedName.startsWith('<')) {
          // No prefix available, use full IRI
          insertText = prefixedName
          label = element.iri
        } else {
          // Use prefixed name
          insertText = prefixedName
          label = prefixedName
        }
      }

      // Add label as alternative display if available
      const displayLabel = element.label || label

      // Determine completion item kind
      let kind: monaco.languages.CompletionItemKind
      let detail: string

      if (element.type === 'class') {
        kind = monaco.languages.CompletionItemKind.Class
        detail = 'Class'
      } else if (element.type === 'property') {
        kind = monaco.languages.CompletionItemKind.Property
        detail = `Property (${(element as any).propertyType})`
      } else {
        kind = monaco.languages.CompletionItemKind.Value
        detail = 'Individual'
      }

      suggestions.push({
        label: displayLabel,
        kind,
        detail,
        documentation: element.description || element.iri,
        insertText,
        range,
        sortText: `${3 - result.score}_${displayLabel}`, // Higher score = earlier in list
      })
    }
  } catch (error) {
    console.error('Failed to get ontology suggestions:', error)
  }

  return suggestions
}

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

// Function to format the current query
function formatQuery() {
  if (!editor) return

  // Don't format if we're in a settings tab
  if (tabsStore.activeTab?.isSettings) return

  const model = editor.getModel()
  if (!model) return

  const currentQuery = model.getValue()
  if (!currentQuery.trim()) return

  try {
    // Get formatting settings
    const settings = getSparqlFormattingSettings()

    // Format the query
    const formattedQuery = formatSparqlQuery(currentQuery, settings)

    // Apply formatted query to editor
    editor.executeEdits('format', [
      {
        range: model.getFullModelRange(),
        text: formattedQuery,
      },
    ])

    // Set cursor to beginning
    editor.setPosition({ lineNumber: 1, column: 1 })
  } catch (error) {
    console.error('Failed to format query:', error)
  }
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

  // Register keyboard shortcut: Cmd+Shift+F (Mac) or Ctrl+Shift+F (Win/Linux) to format query
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
    formatQuery()
  })

  // Listen for format query menu event
  const cleanupFormatMenu = window.electronAPI.menu.onFormatQuery(() => {
    formatQuery()
  })

  // Store cleanup function to call on unmount
  const onUnmountCallbacks = [cleanupFormatMenu]

  // Watch for tab switches and update the editor model
  watch(
    () => tabsStore.activeTabId,
    (newTabId) => {
      if (newTabId) {
        switchToTabModel(newTabId)
      }
    }
  )

  // Store cleanup callbacks on editor instance for unmount
  ;(editor as any)._onUnmountCallbacks = onUnmountCallbacks
})

onUnmounted(() => {
  // Call cleanup callbacks
  if (editor && (editor as any)._onUnmountCallbacks) {
    ;(editor as any)._onUnmountCallbacks.forEach((cleanup: () => void) => cleanup())
  }

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

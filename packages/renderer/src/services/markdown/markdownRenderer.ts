/**
 * Markdown Renderer Service
 * Custom markdown rendering with code copy buttons and XSS protection
 */

import { marked, type Tokens } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Custom renderer for marked that adds copy buttons to code blocks
 */
const renderer = new marked.Renderer()

// Custom code block rendering with copy button
renderer.code = ({ text, lang }: Tokens.Code): string => {
  const langClass = lang ? ` class="language-${lang}"` : ''
  const trimmedCode = text.trim()
  // Escape code for data attribute: quotes and newlines (use &#10; so sanitizer doesn't affect it)
  const dataCode = escapeForDataAttribute(trimmedCode)
  return `<div class="code-block-wrapper"><button class="copy-code-btn" data-code="${dataCode}">Copy</button><pre><code${langClass}>${escapeHtml(trimmedCode)}</code></pre></div>`
}

// Custom link rendering to open in new tab
renderer.link = ({ href, title, text }: Tokens.Link): string => {
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`
}

// Configure marked
marked.setOptions({
  renderer,
  gfm: true,
  breaks: true,
})

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

/**
 * Escape text for use in a data attribute
 */
function escapeForDataAttribute(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/\n/g, '&#10;')
}

/**
 * DOMPurify configuration with explicit allowlist
 */
const purifyConfig: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    'code',
    'pre',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'a',
    'hr',
    'div',
    'span',
    'button',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  ALLOWED_ATTR: [
    'href',
    'target',
    'rel',
    'title',
    'class',
    'data-code',
  ],
  ALLOW_DATA_ATTR: true,
}

/**
 * Render markdown to sanitized HTML
 */
export function renderMarkdown(text: string): string {
  // Parse markdown to HTML
  const rawHtml = marked.parse(text) as string

  // Sanitize HTML to prevent XSS
  const sanitizedHtml = DOMPurify.sanitize(rawHtml, purifyConfig)

  return sanitizedHtml
}

/**
 * Decode HTML entities back to original characters for clipboard copy
 */
export function decodeHtmlEntities(text: string): string {
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&#10;': '\n',
  }
  return text.replace(/&(amp|lt|gt|quot|#039|#10);/g, (m) => map[m])
}

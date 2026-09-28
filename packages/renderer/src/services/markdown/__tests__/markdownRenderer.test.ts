import { describe, it, expect, vi } from 'vitest'
import { renderMarkdown, decodeHtmlEntities } from '../markdownRenderer'

// happy-dom's Node.prototype.nodeName getter returns '' for elements (browsers
// dispatch per node type). DOMPurify reads nodeName through that getter, so in
// happy-dom it treats every element as disallowed and the sanitizer misbehaves.
// Patch the getter to delegate to the most specific subclass getter, as a real
// DOM would, before DOMPurify is loaded.
vi.hoisted(() => {
  const base = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeName')
  Object.defineProperty(Node.prototype, 'nodeName', {
    configurable: true,
    get(this: Node) {
      let proto = Object.getPrototypeOf(this)
      while (proto && proto !== Node.prototype) {
        const desc = Object.getOwnPropertyDescriptor(proto, 'nodeName')
        if (desc?.get) return desc.get.call(this)
        proto = Object.getPrototypeOf(proto)
      }
      return base?.get?.call(this)
    },
  })
})

function parse(html: string): HTMLElement {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

describe('markdownRenderer', () => {
  describe('renderMarkdown', () => {
    it('renders basic markdown', () => {
      const html = renderMarkdown('# Title\n\nSome **bold** and *em* text')
      const el = parse(html)
      expect(el.querySelector('h1')?.textContent).toBe('Title')
      expect(el.querySelector('strong')?.textContent).toBe('bold')
      expect(el.querySelector('em')?.textContent).toBe('em')
    })

    it('renders lists and GFM tables', () => {
      const el = parse(renderMarkdown('- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |'))
      expect(el.querySelectorAll('li')).toHaveLength(2)
      expect(el.querySelector('table')).not.toBeNull()
      expect(el.querySelectorAll('td')).toHaveLength(2)
    })

    it('converts single newlines to <br> (breaks: true)', () => {
      expect(renderMarkdown('line1\nline2')).toContain('<br>')
    })

    it('wraps code blocks with a copy button carrying the raw code', () => {
      const code = 'SELECT * WHERE {\n  ?s ?p "x"\n}'
      const el = parse(renderMarkdown('```sparql\n' + code + '\n```'))
      const wrapper = el.querySelector('.code-block-wrapper')
      expect(wrapper).not.toBeNull()
      const btn = wrapper!.querySelector('button.copy-code-btn')!
      expect(btn.textContent).toBe('Copy')
      expect(btn.getAttribute('data-code')).toBe(code)
      const codeEl = wrapper!.querySelector('pre code')!
      expect(codeEl.className).toBe('language-sparql')
      expect(codeEl.textContent).toBe(code)
    })

    it('omits language class when no language is given', () => {
      const el = parse(renderMarkdown('```\nplain\n```'))
      expect(el.querySelector('pre code')!.getAttribute('class')).toBeNull()
    })

    it('escapes HTML inside code blocks', () => {
      const el = parse(renderMarkdown('```\n<script>alert(1)</script>\n```'))
      expect(el.querySelector('script')).toBeNull()
      expect(el.querySelector('pre code')!.textContent).toBe('<script>alert(1)</script>')
    })

    it('renders links opening in a new tab with a safe rel', () => {
      const el = parse(renderMarkdown('[Example](https://example.org "Ex")'))
      const a = el.querySelector('a')!
      expect(a.getAttribute('href')).toBe('https://example.org')
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
      expect(a.getAttribute('title')).toBe('Ex')
      expect(a.textContent).toBe('Example')
    })

    describe('XSS sanitization', () => {
      it('strips script tags', () => {
        const html = renderMarkdown('hello <script>alert("xss")</script> world')
        expect(html).not.toMatch(/<script/i)
        expect(parse(html).querySelector('script')).toBeNull()
      })

      it('strips onerror attributes (and disallowed img tags)', () => {
        const html = renderMarkdown('<img src=x onerror="alert(1)">')
        expect(html).not.toMatch(/onerror/i)
        expect(parse(html).querySelector('img')).toBeNull()
      })

      it('strips event handlers from allowed tags', () => {
        const html = renderMarkdown('<div onclick="alert(1)" onmouseover="x()">hi</div>')
        expect(html).not.toMatch(/onclick|onmouseover/i)
        expect(parse(html).querySelector('div')?.textContent).toBe('hi')
      })

      it('removes javascript: hrefs from markdown links', () => {
        const html = renderMarkdown('[click](javascript:alert(1))')
        expect(html).not.toMatch(/javascript:/i)
      })

      it('removes javascript: hrefs from raw HTML anchors', () => {
        const html = renderMarkdown('<a href="javascript:alert(1)">x</a>')
        expect(html).not.toMatch(/javascript:/i)
      })

      // Each input holds a single dangerous element: happy-dom's NodeIterator skips
      // the sibling after a removed node, which browsers do not.
      it.each([
        ['iframe', '<iframe src="about:blank"></iframe>', /<iframe/i],
        ['style', '<style>body{}</style>', /<style/i],
        ['form', '<form action="https://evil"></form>', /<form/i],
        ['svg', '<svg onload="alert(1)"></svg>', /<svg|onload/i],
        ['object', '<object data="x"></object>', /<object/i],
      ])('strips %s elements', (_name, input, forbidden) => {
        expect(renderMarkdown(input)).not.toMatch(forbidden)
      })

      it('strips disallowed attributes like style and id', () => {
        const html = renderMarkdown('<span style="color:red" id="x" class="ok">t</span>')
        const span = parse(html).querySelector('span')!
        expect(span.getAttribute('style')).toBeNull()
        expect(span.getAttribute('id')).toBeNull()
        expect(span.getAttribute('class')).toBe('ok')
      })
    })
  })

  describe('decodeHtmlEntities', () => {
    it('decodes the entities produced by the renderer', () => {
      expect(decodeHtmlEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#039;e&#039;&#10;f')).toBe(
        'a & b <c> "d" \'e\'\nf'
      )
    })

    it('leaves unknown entities alone', () => {
      expect(decodeHtmlEntities('&nbsp;&copy;')).toBe('&nbsp;&copy;')
    })
  })
})

import { Marked } from 'marked'
import DOMPurify from 'dompurify'

export function decodePreview(bytes: ArrayBuffer, encoding: string | null) {
  return new TextDecoder(encoding || 'utf-8', { fatal: true }).decode(bytes)
}
const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const markdown = new Marked({
  renderer: {
    html: ({ text }) => escapeHtml(text),
    image: ({ text }) => `<span>[图片：${escapeHtml(text)}]</span>`,
    link: function ({ href, tokens }) {
      const label = this.parser.parseInline(tokens)
      return /^https?:\/\//i.test(href)
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : label
    },
  },
})
export function renderPreviewMarkdown(text: string): string {
  return DOMPurify.sanitize(markdown.parse(text, { async: false }), {
    ALLOWED_TAGS: [
      'p',
      'br',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'strong',
      'em',
      'del',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'a',
      'span',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ADD_URI_SAFE_ATTR: ['target', 'rel'],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
  })
}

export function parsePreviewTable(
  text: string,
  delimiter: string,
  maxRows = 1000,
  maxColumns = 100,
) {
  const rows: string[][] = []
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false,
    truncated = false
  function cell() {
    if (row.length < maxColumns) row.push(field)
    else truncated = true
    field = ''
    closed = false
  }
  function line() {
    cell()
    if (rows.length < maxRows) rows.push(row)
    else truncated = true
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
          closed = true
        }
      } else field += ch
    } else if (ch === delimiter) cell()
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      line()
      if (rows.length >= maxRows && i + 1 < text.length) {
        truncated = true
        break
      }
    } else if (ch === '"' && !field && !closed) quoted = true
    else {
      if (closed || ch === '"')
        return { rows: [], truncated: false, error: '分隔文件的引号格式不正确，请查看源码或下载' }
      field += ch
    }
  }
  if (quoted)
    return { rows: [], truncated: false, error: '分隔文件中存在未闭合引号，请查看源码或下载' }
  if (field || row.length || closed) line()
  return { rows, truncated, error: '' }
}

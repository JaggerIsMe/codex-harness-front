import { marked } from 'marked'
export function renderMarkdownHtml(content: string) {
  return marked.parse(String(content || ''), {
    async: false,
    breaks: true,
    gfm: true,
  })
}

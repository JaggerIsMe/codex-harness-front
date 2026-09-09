import { describe, expect, it } from 'vitest'
import { layoutMode, layoutWidths, readLayoutPreference } from '@/utils/workspaceLayout'
import { decodePreview, parsePreviewTable, renderPreviewMarkdown } from '@/utils/workspacePreview'

describe('workspace layout constraints', () => {
  it('allocates the entire width and respects panel minimums across modes and preferences', () => {
    for (const preference of [
      readLayoutPreference(null),
      readLayoutPreference('{"tree":999,"two":0.1,"three":0.9}'),
    ]) {
      for (const width of [390, 699, 700, 859, 860, 1199, 1200, 1600, 2500]) {
        for (const files of [false, true])
          for (const preview of [false, true]) {
            const mode = layoutMode(width, preview, files)
            const sizes = layoutWidths(width, mode, preference)
            expect(sizes.reduce((a, b) => a + b, 0) + (sizes.length - 1) * 6).toBeCloseTo(width)
            expect(sizes.every((size) => size >= 0)).toBe(true)
            if (sizes.length > 1) expect(sizes[0]).toBeGreaterThanOrEqual(420)
            if (mode === 'three') {
              expect(sizes[1]).toBeGreaterThanOrEqual(400)
              expect(sizes[2]).toBeGreaterThanOrEqual(220)
            }
          }
      }
    }
    expect(layoutWidths(2500, 'three', readLayoutPreference(null))[2]).toBe(300)
  })
  it('uses hysteresis only while expanding and tolerates corrupt preferences', () => {
    expect(layoutMode(1200, true, true, 'dual')).toBe('dual')
    expect(layoutMode(1224, true, true, 'dual')).toBe('three')
    expect(layoutMode(1199, true, true, 'three')).toBe('dual')
    expect(layoutMode(870, true, true, 'single')).toBe('single')
    expect(layoutMode(884, true, true, 'single')).toBe('dual')
    expect(readLayoutPreference('{invalid')).toEqual(readLayoutPreference(null))
    expect(readLayoutPreference('{"tree":"x","two":null,"three":-99}')).toEqual({
      tree: 0,
      two: 0.52,
      three: 0.1,
    })
  })
})
describe('safe workspace content', () => {
  it('renders markdown with no executable HTML or automatically fetched resources', () => {
    const html = renderPreviewMarkdown(
      '# Hello\n<script>alert(1)</script>\n![secret](https://evil.invalid/a)\n[bad](javascript:alert(1))\n[ok](https://example.com)\n<svg onload="alert(1)"/>',
    )
    const element = document.createElement('div')
    element.innerHTML = html
    expect(element.querySelector('h1')?.textContent).toBe('Hello')
    expect(element.querySelectorAll('script,img,svg,iframe,object')).toHaveLength(0)
    expect(element.querySelectorAll('a')).toHaveLength(1)
    expect(element.querySelector('a')?.rel).toBe('noopener noreferrer')
    expect(element.textContent).toContain('<script>')
  })
  it('parses quotes, newlines, escaped quotes, TSV and literal formulas with bounded output', () => {
    expect(parsePreviewTable('a,b\r\n"x,y","line1\nline2"\r\n"""q""",=SUM(A1)', ',').rows).toEqual([
      ['a', 'b'],
      ['x,y', 'line1\nline2'],
      ['"q"', '=SUM(A1)'],
    ])
    expect(parsePreviewTable('a\tb\n1\t2', '\t').rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(parsePreviewTable('a,b,c\n1,2,3\n4,5,6', ',', 2, 2)).toEqual({
      rows: [
        ['a', 'b'],
        ['1', '2'],
      ],
      truncated: true,
      error: '',
    })
    expect(parsePreviewTable('"unclosed', ',').error).toBeTruthy()
    expect(parsePreviewTable('', ',').rows).toEqual([])
  })
  it('decodes valid UTF-16 BOM and rejects malformed UTF-8', () => {
    expect(decodePreview(new Uint8Array([255, 254, 45, 78]).buffer, 'utf-16le')).toBe('中')
    expect(() => decodePreview(new Uint8Array([195, 40]).buffer, 'utf-8')).toThrow()
  })
})

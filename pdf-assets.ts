import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/** Serve and emit the same PDF.js resources locally in development and production. */
export function pdfAssets(): Plugin {
  const assets = new Map<string, string>()
  for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    const directory = new URL(`./node_modules/pdfjs-dist/${folder}/`, import.meta.url)
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile())
        assets.set(`pdfjs/${folder}/${entry.name}`, fileURLToPath(new URL(entry.name, directory)))
    }
  }
  assets.set(
    'pdfjs/LICENSE',
    fileURLToPath(new URL('./node_modules/pdfjs-dist/LICENSE', import.meta.url)),
  )
  return {
    name: 'local-pdf-resources',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]!.replace(/^\//, '')
        const file = assets.get(path)
        if (!file) return next()
        res.setHeader(
          'Content-Type',
          path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
        )
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      for (const [fileName, path] of assets)
        this.emitFile({ type: 'asset', fileName, source: readFileSync(path) })
    },
  }
}

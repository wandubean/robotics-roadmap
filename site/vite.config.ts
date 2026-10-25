import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type HtmlTagDescriptor, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'compression'
// the config and the files it imports name their .ts extension, as Node's own TypeScript loading requires
import { lessonData } from './lesson-data.ts'
import { quizServer } from './quiz-server.ts'
import { updateServer } from './update-server.ts'
import { CONFIG } from './src/config.ts'

/** Description and Open Graph / Twitter card tags, so a shared link shows a title, summary and the map image. */
function shareMeta(): Plugin {
  const S = CONFIG.share
  const image = new URL(S.image, S.siteUrl).href
  const tags: [string, string, string][] = [
    ['name', 'description', S.description],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', S.title],
    ['property', 'og:locale', S.locale],
    ['property', 'og:url', S.siteUrl],
    ['property', 'og:title', S.title],
    ['property', 'og:description', S.description],
    ['property', 'og:image', image],
    ['property', 'og:image:secure_url', image],
    ['property', 'og:image:type', 'image/png'],
    ['property', 'og:image:width', String(S.imageWidth)],
    ['property', 'og:image:height', String(S.imageHeight)],
    ['property', 'og:image:alt', S.imageAlt],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', S.title],
    ['name', 'twitter:description', S.description],
    ['name', 'twitter:image', image],
  ]
  return {
    name: 'share-meta',
    transformIndexHtml: () =>
      tags.map(([key, name, content]): HtmlTagDescriptor => ({ tag: 'meta', attrs: { [key]: name, content }, injectTo: 'head' })),
  }
}

/**
 * The dev server sends modules unminified, so a phone opening the map over Tailscale would pull megabytes of plain text;
 * gzip cuts that to a fifth. The built site is compressed by its host instead.
 */
function compressDev(): Plugin {
  return {
    name: 'compress-dev',
    configureServer(server) {
      // compression is typed for Express; it only uses the Node request and response that connect hands it
      server.middlewares.use(compression() as unknown as Connect.NextHandleFunction)
    },
  }
}

/**
 * Optional, git-ignored dev-server.local.json for opening the map from another machine, e.g.
 * { "host": true, "allowedHosts": ["my-laptop", ".ts.net"] }. Without it the server answers on localhost only.
 */
function localServerOptions(): { host?: boolean | string; allowedHosts?: string[] } {
  try {
    return JSON.parse(readFileSync(new URL('./dev-server.local.json', import.meta.url), 'utf8'))
  } catch {
    return {}
  }
}

// lessons/ lives one level above the site root.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  base: './',
  plugins: [compressDev(), lessonData(repoRoot), react(), shareMeta(), quizServer(repoRoot), updateServer(repoRoot)],
  server: { ...localServerOptions(), fs: { allow: ['..'] } },
  // a lesson body arrives as its rendered tree in a JSON string, KaTeX output included: up to about 2.3 MB (85 kB gzip)
  // for the longest. The code chunks stay near 500 kB
  build: { chunkSizeWarningLimit: 2400 },
})

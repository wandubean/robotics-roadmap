import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import { CONFIG } from './src/config.ts'
import { computeLayout } from './src/curriculum/layout.ts'
import { renderBank, renderMarkdown } from './lesson-render.ts'
import { buildCurriculum } from './src/curriculum/graph.ts'
import { bodyOf, parseBank, parseBranches, parseLesson } from './src/curriculum/parse.ts'

const CURRICULUM = 'virtual:curriculum'
const PROGRESS = 'virtual:progress'
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/
const ASSET = /\.(png|jpe?g|gif|svg|webp)$/i
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

const resolved = (id: string) => `\0${id}`
// `lessons/<id>/README.md?lesson` is the body rendered to an HTML tree, `lessons/<id>/quiz.yaml?bank` the bank parsed,
// checked and rendered
const LESSON = /\/README\.md\?lesson$/
const BANK = /\/quiz\.yaml\?bank$/

/** a module whose default export is `value`; JSON.parse reads a large tree faster than a JS object literal */
const jsonModule = (value: unknown) => `export default JSON.parse(${JSON.stringify(JSON.stringify(value))})`

/** every file under `dir`, as paths relative to it */
function walk(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
  )
}

/**
 * What the map needs before anything is drawn, gathered on the server into two modules so a phone over a slow link
 * fetches two files instead of one per lesson, figure and record:
 * - `virtual:curriculum`: branches.yaml and each lesson's frontmatter, parsed, and the map layout, computed here so the
 *   page carries neither a YAML parser nor ELK, nor their work
 * - `virtual:progress`: the quiz records in progress/
 * A lesson body imported as `README.md?lesson` and a quiz bank imported as `quiz.yaml?bank` arrive as rendered HTML
 * trees (lesson-render.ts), so the page carries no YAML, markdown or KaTeX code at all. Lesson figures are served (dev)
 * and copied (build) at lessons/<id>/..., so the page links them by path.
 */
export function lessonData(repoRoot: string): Plugin {
  const lessonsDir = path.join(repoRoot, 'lessons')
  const progressDir = path.join(repoRoot, CONFIG.quiz.progressDir)
  // the layout takes ELK a moment; a save that leaves every frontmatter as it was reuses the last one
  let cached: { key: string; code: string } | null = null

  const lessonIds = () =>
    readdirSync(lessonsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(path.join(lessonsDir, d.name, 'README.md')))
      .map((d) => d.name)
      .sort()

  async function curriculumModule(watch: (file: string) => void): Promise<string> {
    const branchesFile = path.join(lessonsDir, 'branches.yaml')
    watch(branchesFile)
    const branchesSource = await readFile(branchesFile, 'utf8')
    const headers: Record<string, string> = {}
    for (const id of lessonIds()) {
      const file = path.join(lessonsDir, id, 'README.md')
      watch(file)
      headers[id] = FRONTMATTER.exec(await readFile(file, 'utf8'))?.[0] ?? ''
    }
    const key = JSON.stringify([branchesSource, headers])
    if (cached?.key === key) return cached.code
    // parsed here so the page carries no YAML parser for the map
    const spec = parseBranches(branchesSource)
    const lessons = Object.entries(headers).map(([id, header]) => parseLesson(id, header))
    const layout = await computeLayout(buildCurriculum(spec, lessons))
    const code = [
      `export const spec = ${JSON.stringify(spec)}`,
      `export const lessons = ${JSON.stringify(lessons)}`,
      // Map does not survive JSON, so nodes travel as entries; the edge polylines serve only the layout checks
      `export const layout = ${JSON.stringify({ ...layout, nodes: [...layout.nodes], edges: layout.edges.map(({ points: _, ...e }) => e) })}`,
    ].join('\n')
    cached = { key, code }
    return code
  }

  async function progressModule(watch: (file: string) => void): Promise<string> {
    const records: Record<string, string> = {}
    if (existsSync(progressDir)) {
      for (const name of readdirSync(progressDir).filter((f) => f.endsWith('.json')).sort()) {
        const file = path.join(progressDir, name)
        watch(file)
        records[name.replace(/\.json$/, '')] = await readFile(file, 'utf8')
      }
    }
    return `export const records = ${JSON.stringify(records)}`
  }

  /** a lesson or record file appearing or going away changes the module's contents, not just one watched file */
  function invalidateOn(server: ViteDevServer) {
    const refresh = (file: string) => {
      const inLessons = file.startsWith(lessonsDir + path.sep) && file.endsWith(`${path.sep}README.md`)
      const inProgress = file.startsWith(progressDir + path.sep) && file.endsWith('.json')
      if (!inLessons && !inProgress) return
      const mod = server.moduleGraph.getModuleById(resolved(inLessons ? CURRICULUM : PROGRESS))
      if (mod) server.reloadModule(mod)
    }
    server.watcher.on('add', refresh)
    server.watcher.on('unlink', refresh)
  }

  return {
    name: 'lesson-data',
    resolveId(id) {
      if (id === CURRICULUM || id === PROGRESS) return resolved(id)
    },
    async load(id) {
      const watch = (file: string) => this.addWatchFile(file)
      if (id === resolved(CURRICULUM)) return curriculumModule(watch)
      if (id === resolved(PROGRESS)) return progressModule(watch)
      if (LESSON.test(id) || BANK.test(id)) {
        const file = id.replace(/\?\w+$/, '')
        watch(file)
        const source = await readFile(file, 'utf8')
        return jsonModule(LESSON.test(id) ? renderMarkdown(bodyOf(source)) : renderBank(parseBank(source)))
      }
    },
    configureServer(server) {
      server.watcher.add([lessonsDir, progressDir])
      invalidateOn(server)
      server.middlewares.use('/lessons/', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        const file = path.resolve(lessonsDir, rel)
        if (!ASSET.test(file) || !file.startsWith(lessonsDir + path.sep) || !existsSync(file)) return next()
        res.setHeader('Content-Type', MIME[path.extname(file).slice(1).toLowerCase()])
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      for (const rel of walk(lessonsDir).filter((f) => ASSET.test(f))) {
        this.emitFile({ type: 'asset', fileName: `lessons/${rel}`, source: readFileSync(path.join(lessonsDir, rel)) })
      }
    },
  }
}

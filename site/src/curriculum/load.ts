import type { Root } from 'hast'
import { lessons, layout as rawLayout, spec } from 'virtual:curriculum'
import { records } from 'virtual:progress'
import type { MapLayout, NodePos } from './layout'
import { buildCurriculum } from './graph'
import { parseResult, type Attempt, type Topic } from './quiz'

// The parsed frontmatter and the layout come with the graph in one module (see lesson-data.ts); bodies are fetched when
// a subject is opened. In dev, editing a lesson re-runs this module through HMR, so the map stays in step with the repo.
const bodies = import.meta.glob('../../../lessons/*/README.md', {
  query: '?lesson',
  import: 'default',
}) as Record<string, () => Promise<Root>>

const subjectPath = (id: string) => `../../../lessons/${id}/README.md`

export const curriculum = buildCurriculum(spec, lessons)

/** The map layout, computed on the server from the same frontmatter. */
export const layout: MapLayout = (() => {
  const raw = rawLayout as Omit<MapLayout, 'nodes'> & { nodes: [string, NodePos][] }
  return { ...raw, nodes: new Map(raw.nodes) }
})()

/** The lesson body, rendered on the server (lesson-render.ts). */
export async function loadBody(id: string): Promise<Root> {
  return bodies[subjectPath(id)]()
}

/** Where a figure referenced from a lesson's README (e.g. `figures/arch.svg`) is served: lessons/<id>/... beside the page. */
export function assetUrl(lessonId: string, relative: string): string {
  return `lessons/${lessonId}/${relative.replace(/^\.\//, '')}`
}

// parsed and rendered on the server (lesson-data.ts)
const banks = import.meta.glob('../../../lessons/*/quiz.yaml', {
  query: '?bank',
  import: 'default',
}) as Record<string, () => Promise<Topic<Root>[]>>

/** Whether a lesson has a quiz bank. */
export const hasQuiz = (id: string) => `../../../lessons/${id}/quiz.yaml` in banks

/** lessons/<id>/quiz.yaml, fetched when the quiz opens. */
export async function loadBank(id: string): Promise<Topic<Root>[]> {
  return banks[`../../../lessons/${id}/quiz.yaml`]()
}

// Results are small and decide every node's state, so they ship with the graph. In dev, a file the quiz server writes
// re-runs this module through HMR.
export const initialAttempts: Record<string, Attempt[]> = Object.fromEntries(
  Object.entries(records).map(([id, source]) => [id, parseResult(source).attempts]),
)

import type { Curriculum, Lesson, MapSpec } from './types.ts'

// The lesson graph, built from what parse.ts reads. Shared by the page and the server, so it imports no parser.

export class CurriculumError extends Error {}

export function fail(where: string, message: string): never {
  throw new CurriculumError(`${where}: ${message}`)
}

/** Link lessons into a graph and check references, branches and cycles. */
export function buildCurriculum({ hub, trees, branches }: MapSpec, lessons: Lesson[]): Curriculum {
  const branchIds = new Set(branches.map((b) => b.id))
  if (branchIds.size !== branches.length) fail('branches.yaml', 'duplicate branch id')
  if (branches.filter((b) => b.core).length !== 1) fail('branches.yaml', 'exactly one core branch required')
  if (new Set(trees.map((t) => t.id)).size !== trees.length) fail('branches.yaml', 'duplicate tree id')
  const hubBranches = hub.rings.flatMap((r) => r.branches)
  const planted = [...hubBranches, ...trees.flatMap((t) => t.branches)]
  for (const b of branches) {
    if (planted.filter((id) => id === b.id).length !== 1) fail('branches.yaml', `branch "${b.id}" must sit in exactly one tree or the hub`)
  }
  for (const id of planted) if (!branchIds.has(id)) fail('branches.yaml', `tree lists unknown branch "${id}"`)

  const byId = new Map<string, Lesson>()
  for (const p of lessons) {
    if (byId.has(p.id)) fail(p.path, `duplicate id "${p.id}"`)
    if (!branchIds.has(p.branch)) fail(p.path, `unknown branch "${p.branch}"`)
    byId.set(p.id, p)
  }
  const ringOf = new Map<string, number>()
  hub.rings.forEach((r, i) => {
    for (const id of r.lessons) {
      if (!byId.has(id)) fail('branches.yaml', `hub lists unknown lesson "${id}"`)
      if (hubBranches.includes(byId.get(id)!.branch) || ringOf.has(id)) fail('branches.yaml', `hub lesson "${id}" is listed twice`)
      ringOf.set(id, i + 1)
    }
    for (const p of lessons) if (r.branches.includes(p.branch)) ringOf.set(p.id, p.requires.length === 0 ? 0 : i + 1)
  })
  for (const [id, ring] of ringOf) {
    for (const q of byId.get(id)!.requires) {
      if (!byId.has(q)) continue // reported below
      if (!ringOf.has(q) || ringOf.get(q)! > ring) fail(byId.get(id)!.path, `hub lesson requires "${q}", which is not on its ring or inside it`)
    }
  }

  const unlocks = new Map<string, string[]>(lessons.map((p) => [p.id, []]))
  for (const p of lessons) {
    for (const r of p.requires) {
      if (!byId.has(r)) fail(p.path, `requires unknown lesson "${r}"`)
      unlocks.get(r)!.push(p.id)
    }
  }

  // cycle check (DFS colouring)
  const color = new Map<string, 0 | 1 | 2>()
  const visit = (id: string, trail: string[]) => {
    const c = color.get(id) ?? 0
    if (c === 2) return
    if (c === 1) fail(byId.get(id)!.path, `prerequisite cycle: ${[...trail, id].join(' -> ')}`)
    color.set(id, 1)
    for (const r of byId.get(id)!.requires) visit(r, [...trail, id])
    color.set(id, 2)
  }
  for (const p of lessons) visit(p.id, [])

  return { hub: ringOf, trees, branches, lessons, byId, unlocks }
}

/** All transitive prerequisites of a lesson. */
export function ancestors(c: Curriculum, id: string): Set<string> {
  const out = new Set<string>()
  const stack = [...c.byId.get(id)!.requires]
  while (stack.length) {
    const r = stack.pop()!
    if (out.has(r)) continue
    out.add(r)
    stack.push(...c.byId.get(r)!.requires)
  }
  return out
}

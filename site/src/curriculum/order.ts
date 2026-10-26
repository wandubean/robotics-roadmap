// Layer assignment and in-layer order for the map, computed before ELK so the map keeps few crossings.
// ELK's own crossing minimisation leaves many crossings on this graph; this one runs barycentre sweeps
// with adjacent swaps from many seeded starts and keeps the best, which ELK then takes as given.
import type { Curriculum } from './types.ts'

export interface Ordering {
  /**
   * layers from the top, every prerequisite in a higher layer than the lessons it opens; each left to right:
   * lesson ids, and a waypoint for the edges passing through that layer: `from>to@layer` for one edge alone,
   * `*>to@layer` for the edges gathered into one lesson, `from>*@layer` for the edges leaving one lesson together
   */
  rows: string[][]
  /** the waypoints of each edge `from>to`, from the top */
  via: Map<string, string[]>
  /** edge crossings between neighbouring layers in `rows` */
  crossings: number
}

/**
 * Layer = length of the longest prerequisite chain above the lesson. Lessons of an outer branch go no higher than the
 * deepest of the other lessons, so the newest research ends the tree.
 */
function assignLayers(c: Curriculum): Map<string, number> {
  const outer = new Set(c.branches.filter((b) => b.outer).map((b) => b.id))
  const isOuter = (id: string) => outer.has(c.byId.get(id)!.branch)
  const longest = (floor: number): Map<string, number> => {
    const layer = new Map<string, number>()
    const visit = (id: string): number => {
      const known = layer.get(id)
      if (known !== undefined) return known
      const l = Math.max(Math.max(-1, ...c.byId.get(id)!.requires.map(visit)) + 1, isOuter(id) ? floor : 0)
      layer.set(id, l)
      return l
    }
    for (const p of c.lessons) visit(p.id)
    return layer
  }
  const natural = longest(0)
  return longest(Math.max(0, ...c.lessons.filter((p) => !isOuter(p.id)).map((p) => natural.get(p.id)!)))
}

/** mulberry32: small seeded PRNG so the map comes out the same on every load */
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function orderLayers(c: Curriculum, opts: { restarts: number; sweeps: number; seed: number }): Ordering {
  const layer = assignLayers(c)
  const rows: string[][] = Array.from({ length: Math.max(...layer.values()) + 1 }, () => [])
  for (const p of c.lessons) rows[layer.get(p.id)!].push(p.id)

  // split every edge into one segment per layer gap, with a waypoint in each layer it passes. Edges into one lesson
  // share their waypoints from the layer below their lowest prerequisite, so they meet early and arrive as one line;
  // edges out of one lesson share theirs above that, until each turns toward its own lesson
  const edges = c.lessons.flatMap((p) => p.requires.map((r) => ({ from: r, to: p.id })))
  const long = edges.filter((e) => layer.get(e.to)! - layer.get(e.from)! >= 2)
  const meet = new Map<string, number>()
  for (const p of c.lessons) {
    const into = long.filter((e) => e.to === p.id)
    if (into.length >= 2) meet.set(p.id, Math.max(...into.map((e) => layer.get(e.from)!)) + 1)
  }
  const gathered = (e: { to: string }, l: number) => meet.has(e.to) && l >= meet.get(e.to)!
  const leaving = (r: string, l: number) =>
    long.filter((e) => e.from === r && layer.get(r)! < l && l < layer.get(e.to)! && !gathered(e, l)).length
  const waypoint = (e: { from: string; to: string }, l: number) =>
    gathered(e, l) ? `*>${e.to}@${l}` : leaving(e.from, l) >= 2 ? `${e.from}>*@${l}` : `${e.from}>${e.to}@${l}`

  const up = new Map<string, string[]>()
  const down = new Map<string, string[]>()
  const link = (a: string, b: string) => {
    if (down.get(a)?.includes(b)) return
    down.set(a, [...(down.get(a) ?? []), b])
    up.set(b, [...(up.get(b) ?? []), a])
  }
  const via = new Map<string, string[]>()
  for (const e of edges) {
    const stops: string[] = []
    let prev = e.from
    for (let l = layer.get(e.from)! + 1; l < layer.get(e.to)!; l++) {
      const w = waypoint(e, l)
      if (!rows[l].includes(w)) rows[l].push(w)
      stops.push(w)
      link(prev, w)
      prev = w
    }
    link(prev, e.to)
    via.set(`${e.from}>${e.to}`, stops)
  }

  const pos = new Map<string, number>()
  const index = (row: string[]) => row.forEach((v, i) => pos.set(v, i))
  // crossings between row l and row l + 1
  const gap = (l: number): number => {
    const segs: [number, number][] = []
    for (const v of rows[l]) for (const w of down.get(v) ?? []) segs.push([pos.get(v)!, pos.get(w)!])
    let n = 0
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        if ((segs[i][0] - segs[j][0]) * (segs[i][1] - segs[j][1]) < 0) n++
      }
    }
    return n
  }
  const total = () => rows.slice(0, -1).reduce((n, _, l) => n + gap(l), 0)
  const near = (l: number) => (l > 0 ? gap(l - 1) : 0) + (l < rows.length - 1 ? gap(l) : 0)

  const sweep = (l: number, neighbours: Map<string, string[]>) => {
    const key = new Map(
      rows[l].map((v) => {
        const ns = neighbours.get(v) ?? []
        return [v, ns.length ? ns.reduce((s, u) => s + pos.get(u)!, 0) / ns.length : pos.get(v)!]
      }),
    )
    rows[l].sort((a, b) => key.get(a)! - key.get(b)!)
    index(rows[l])
  }
  // swap neighbours in a layer while that removes crossings
  const transpose = () => {
    for (let improved = true; improved; ) {
      improved = false
      rows.forEach((row, l) => {
        for (let i = 0; i + 1 < row.length; i++) {
          const before = near(l)
          ;[row[i], row[i + 1]] = [row[i + 1], row[i]]
          index(row)
          if (near(l) < before) improved = true
          else {
            ;[row[i], row[i + 1]] = [row[i + 1], row[i]]
            index(row)
          }
        }
      })
    }
  }

  const rand = random(opts.seed)
  let best = { rows: rows.map((r) => [...r]), via, crossings: Infinity }
  for (let start = 0; start < opts.restarts; start++) {
    // the first start keeps the lessons' file order, the rest shuffle every layer
    if (start > 0) {
      for (const row of rows) {
        for (let i = row.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1))
          ;[row[i], row[j]] = [row[j], row[i]]
        }
      }
    }
    rows.forEach(index)
    for (let s = 0; s < opts.sweeps; s++) {
      if (s % 2 === 0) for (let l = 1; l < rows.length; l++) sweep(l, up)
      else for (let l = rows.length - 2; l >= 0; l--) sweep(l, down)
      transpose()
      const n = total()
      if (n < best.crossings) best = { rows: rows.map((r) => [...r]), via, crossings: n }
    }
    if (best.crossings === 0) break
  }
  return best
}

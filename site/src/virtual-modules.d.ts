// modules served by lesson-data.ts

declare module 'virtual:curriculum' {
  import type { Lesson, MapSpec } from './curriculum/types'
  /** lessons/branches.yaml, parsed */
  export const spec: MapSpec
  /** each lessons/<id>/README.md's frontmatter, parsed; `body` is empty */
  export const lessons: Lesson[]
  /** a MapLayout with its nodes as [id, NodePos] entries; curriculum/load.ts turns it back */
  export const layout: unknown
}

declare module 'virtual:progress' {
  /** lesson id → the text of progress/<id>.json */
  export const records: Record<string, string>
}

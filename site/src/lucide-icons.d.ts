// lucide-react types its package entry only; components/icons.ts imports single icon files
declare module 'lucide-react/dist/esm/icons/*.mjs' {
  import type { LucideIcon } from 'lucide-react'
  const icon: LucideIcon
  export default icon
}

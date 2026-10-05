export const BREAKPOINTS = {
  narrow: '22.5rem',
  xs: '30rem',
  sm: '40rem',
  md: '48rem',
  lg: '64rem',
  wide: '72rem',
  xl: '80rem',
  '2xl': '96rem',
} as const

export type BreakpointName = keyof typeof BREAKPOINTS

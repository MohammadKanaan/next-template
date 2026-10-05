import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(value: string, maximumParts = 2): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maximumParts)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('')
}

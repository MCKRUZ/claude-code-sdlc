// The one class-name helper the kit uses. `clsx` handles the conditional shapes (arrays, objects,
// falsy values); `twMerge` resolves Tailwind conflicts so a caller's `className` can override a
// primitive's default (`px-4` on a Button that emits `px-3`) instead of fighting it in the cascade.
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export type { ClassValue }

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

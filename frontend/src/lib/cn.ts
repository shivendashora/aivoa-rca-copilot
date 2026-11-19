import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Join and resolve conflicting Tailwind classes. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

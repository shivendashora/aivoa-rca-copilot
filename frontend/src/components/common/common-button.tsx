import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'icon' | 'send'

interface CommonButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: ReactNode
  variant?: Variant
}

const variants: Record<Variant, string> = {
  // Full-width call to action, e.g. "Commit to QMS Ledger"
  primary:
    'h-[42px] w-full rounded-field bg-brand text-[13.5px] font-medium text-white transition-colors hover:bg-brand-hover',
  // Bare icon, e.g. attach
  icon: 'grid place-items-center text-muted transition-colors hover:text-brand',
  // Small square brand button, e.g. send
  send: 'grid size-7 shrink-0 place-items-center rounded-field bg-brand text-white transition-colors hover:bg-brand-hover',
}

export default function CommonButton({
  label,
  children,
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: CommonButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {label ?? children}
    </button>
  )
}

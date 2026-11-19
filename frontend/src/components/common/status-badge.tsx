import { cn } from '../../lib/cn'

export default function StatusBadge({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium',
        ready ? 'bg-ready text-ready-text' : 'bg-pending text-pending-text',
      )}
    >
      {ready && <span className="size-1.5 rounded-full bg-ready-dot" />}
      {label}
    </span>
  )
}

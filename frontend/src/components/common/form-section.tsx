import type { ReactNode } from 'react'

/** Numbered form section: small uppercase title over a 2-column field grid. */
export default function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-[22px]">
      <h2 className="mb-3 text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-2">{title}</h2>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 md:grid-cols-2">{children}</div>
    </section>
  )
}

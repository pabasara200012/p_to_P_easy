import classNames from 'classnames'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface SectionCardProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export const SectionCard = ({ title, subtitle, actions, children, className }: SectionCardProps) => (
  <motion.section
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.28, ease: 'easeOut' }}
    className={classNames('rounded-[24px] border border-white/10 bg-[var(--app-card)] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl', className)}
  >
    <header className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm leading-6 text-slate-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
    {children}
  </motion.section>
)

import classNames from 'classnames'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * 100
    const y = 100 - ((value - min) / range) * 100
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox="0 0 100 100" className="h-10 w-20 shrink-0 opacity-90" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface MetricCardProps {
  label: string
  value: string
  detail?: string
  accent?: string
  icon?: ReactNode
  trend?: string
  sparkline?: number[]
}

export const MetricCard = ({ label, value, detail, accent = 'from-blue-500/20 via-cyan-400/10 to-transparent', icon, trend, sparkline }: MetricCardProps) => (
  <motion.article
    whileHover={{ y: -2, scale: 1.01 }}
    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[var(--app-card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl"
  >
    <div className={classNames('absolute inset-0 bg-gradient-to-br opacity-70', accent)} />
    <div className="relative flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">{label}</p>
        <p className="mt-3 text-[28px] font-semibold tracking-tight text-white">{value}</p>
        {trend ? <p className="mt-2 text-sm font-medium text-emerald-300">{trend}</p> : null}
        {detail ? <p className="mt-2 text-sm text-slate-300">{detail}</p> : null}
      </div>
      <div className="flex flex-col items-end gap-3 text-cyan-200">
        {icon ? <div className="rounded-2xl border border-white/10 bg-white/10 p-3 shadow-lg shadow-slate-950/20">{icon}</div> : null}
        {sparkline ? <Sparkline values={sparkline} /> : null}
      </div>
    </div>
  </motion.article>
)

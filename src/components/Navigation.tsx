import classNames from 'classnames'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArchiveRestore,
  ArrowDownToLine,
  ArrowUpToLine,
  BellRing,
  ChartColumnIncreasing,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  LineChart,
  MoreHorizontal,
  Settings2,
  Sheet,
  UsersRound,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { PageKey } from '../types'

interface NavigationProps {
  currentPage: PageKey
  onNavigate: (page: PageKey) => void
}

const pages: Array<{ key: PageKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'buy', label: 'Buy' },
  { key: 'sell', label: 'Sell' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'history', label: 'History' },
  { key: 'activity-log', label: 'Activity Log' },
  { key: 'archive', label: 'Archive' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'goals', label: 'Goals' },
  { key: 'forecasting', label: 'Forecasting' },
  { key: 'advanced-analytics', label: 'Pro Analytics' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
]

const coreMobilePages: Array<{ key: PageKey; label: string; icon: ReactNode }> = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: 'buy', label: 'Buy', icon: <ArrowDownToLine className="h-4 w-4" /> },
  { key: 'sell', label: 'Sell', icon: <ArrowUpToLine className="h-4 w-4" /> },
  { key: 'analytics', label: 'Analytics', icon: <ChartColumnIncreasing className="h-4 w-4" /> },
]

const morePages: Array<{ key: PageKey; label: string; icon: ReactNode }> = [
  { key: 'inventory', label: 'Inventory', icon: <CircleDollarSign className="h-4 w-4" /> },
  { key: 'history', label: 'History', icon: <ClipboardList className="h-4 w-4" /> },
  { key: 'activity-log', label: 'Activity Log', icon: <BellRing className="h-4 w-4" /> },
  { key: 'archive', label: 'Archive', icon: <ArchiveRestore className="h-4 w-4" /> },
  { key: 'accounts', label: 'Accounts', icon: <UsersRound className="h-4 w-4" /> },
  { key: 'goals', label: 'Goals', icon: <Sheet className="h-4 w-4" /> },
  { key: 'forecasting', label: 'Forecasting', icon: <LineChart className="h-4 w-4" /> },
  { key: 'advanced-analytics', label: 'Pro Analytics', icon: <ChartColumnIncreasing className="h-4 w-4" /> },
  { key: 'reports', label: 'Reports', icon: <ClipboardList className="h-4 w-4" /> },
  { key: 'settings', label: 'Settings', icon: <Settings2 className="h-4 w-4" /> },
]

export const Navigation = ({ currentPage, onNavigate }: NavigationProps) => {
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      <nav className="sticky top-4 hidden h-fit w-72 flex-col gap-2 rounded-[28px] border border-white/10 bg-[var(--app-card-soft)] p-3 shadow-[0_24px_70px_rgba(15,23,42,0.24)] backdrop-blur-2xl xl:flex">
        <div className="mb-2 rounded-[24px] border border-white/10 bg-white/5 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Enterprise Suite</p>
          <p className="mt-2 text-lg font-semibold text-white">Binance P2P Tracker</p>
          <p className="mt-1 text-sm text-slate-400">Premium fintech workspace</p>
        </div>
        {pages.map((page) => {
          const isActive = currentPage === page.key
          const icon = page.key === 'dashboard' ? <LayoutDashboard className="h-4 w-4" /> : page.key === 'buy' ? <ArrowDownToLine className="h-4 w-4" /> : page.key === 'sell' ? <ArrowUpToLine className="h-4 w-4" /> : page.key === 'analytics' ? <ChartColumnIncreasing className="h-4 w-4" /> : page.key === 'inventory' ? <CircleDollarSign className="h-4 w-4" /> : page.key === 'history' ? <ClipboardList className="h-4 w-4" /> : page.key === 'reports' ? <ClipboardList className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />
          return (
            <button
              key={page.key}
              type="button"
              onClick={() => onNavigate(page.key)}
              className={classNames(
                'flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition',
                isActive ? 'bg-white text-slate-950 shadow-lg shadow-slate-950/10' : 'text-slate-300 hover:bg-white/5 hover:text-white',
              )}
            >
              <span className={classNames('flex h-9 w-9 items-center justify-center rounded-xl border', isActive ? 'border-white/20 bg-slate-950 text-white' : 'border-white/10 bg-white/5 text-cyan-200')}>
                {icon}
              </span>
              <span>{page.label}</span>
            </button>
          )
        })}
      </nav>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[rgba(2,6,23,0.82)] px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 backdrop-blur-2xl xl:hidden">
        <div className="grid grid-cols-5 gap-2">
          {coreMobilePages.map((page) => {
            const isActive = currentPage === page.key
            return (
              <button
                key={page.key}
                type="button"
                onClick={() => onNavigate(page.key)}
                className={classNames(
                  'flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-[11px] font-semibold transition',
                  isActive ? 'bg-white text-slate-950 shadow-lg shadow-slate-950/10' : 'text-slate-400 hover:bg-white/5 hover:text-white',
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5">{page.icon}</span>
                {page.label}
              </button>
            )
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-[11px] font-semibold text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5"><MoreHorizontal className="h-4 w-4" /></span>
            More
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/60 px-3 pb-24 pt-6 backdrop-blur-xl xl:hidden"
            onClick={() => setMoreOpen(false)}
          >
            <motion.div
              initial={{ y: 24, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 12, scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="mx-auto w-full max-w-md rounded-[28px] border border-white/10 bg-[var(--app-card)] p-4 shadow-[0_28px_80px_rgba(15,23,42,0.34)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">More</p>
                  <p className="mt-1 text-lg font-semibold text-white">Additional Pages</p>
                </div>
                <button type="button" onClick={() => setMoreOpen(false)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                  Close
                </button>
              </div>
              <div className="grid gap-2">
                {morePages.map((page) => (
                  <button
                    key={page.key}
                    type="button"
                    onClick={() => {
                      onNavigate(page.key)
                      setMoreOpen(false)
                    }}
                    className={classNames('flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition', currentPage === page.key ? 'bg-white text-slate-950' : 'bg-white/5 text-slate-200 hover:bg-white/10')}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">{page.icon}</span>
                    <span className="font-medium">{page.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

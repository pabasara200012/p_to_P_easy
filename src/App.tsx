import type { FormEvent, ReactNode } from 'react'
import { useDeferredValue, useMemo, useState } from 'react'
import classNames from 'classnames'
import { format } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import { jsPDF } from 'jspdf'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowUpRight, Clock3, Edit2, Eye, Sparkles, Trash2, TrendingUp, WalletCards } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Navigation } from './components/Navigation'
import { MetricCard } from './components/MetricCard'
import { Modal } from './components/Modal'
import { SectionCard } from './components/SectionCard'
import { buildAnalytics } from './utils/analytics'
import { getCurrencyOptions } from './utils/currency'
import { friendlyDateTime, formatMoney, formatNumber, formatPercent, formatUsd, toInputDateTime } from './utils/format'
import { useTrackerState } from './hooks/useTrackerState'
import type { BuyFormState, DateRange, PageKey, SellFormState } from './types'
import { buildDailyReport, buildMonthlyReport, buildOverallReport, buildWeeklyReport, toCsv, toJson, toWorkbook } from './utils/reports'
import { applyTradeSearch, parseTradeSearchQuery } from './state/selectors'

const emptyBuyForm = (): BuyFormState => ({
  dateTime: toInputDateTime(new Date()),
  currency: 'USD',
  buyRate: 0,
  lkrAmountPaid: 0,
  bankCharges: 0,
  additionalCharges: 0,
  notes: '',
  tags: '',
})

const emptySellForm = (): SellFormState => ({
  dateTime: toInputDateTime(new Date()),
  currency: 'USD',
  sellRate: 0,
  usdSold: 0,
  bankCharges: 0,
  additionalCharges: 0,
  notes: '',
  tags: '',
})

const defaultRange = (): DateRange => ({
  start: toInputDateTime(new Date('1970-01-01T00:00:00')),
  end: toInputDateTime(new Date()),
})

const chartColors = ['#22d3ee', '#a78bfa', '#34d399', '#f59e0b', '#fb7185', '#60a5fa']

const exportBlob = (filename: string, content: BlobPart, type: string) => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={classNames('flex flex-col gap-2', className)}>
      <span className="text-sm font-medium text-slate-300">{label}</span>
      {children}
    </label>
  )
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/10 bg-white/5 p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-cyan-200">
        <Sparkles className="h-6 w-6" />
      </div>
      <h3 className="mt-5 text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

function App() {
  const { state, statistics, undoSnapshot, actions } = useTrackerState()
  const analytics = useMemo(() => buildAnalytics(state.buys, state.sells, state.inventoryLots), [state.buys, state.inventoryLots, state.sells])
  const [page, setPage] = useState<PageKey>('dashboard')
  const [buyForm, setBuyForm] = useState<BuyFormState>(emptyBuyForm)
  const [sellForm, setSellForm] = useState<SellFormState>(emptySellForm)
  const [editor, setEditor] = useState<{ kind: 'buy' | 'sell'; mode: 'view' | 'edit'; id: string } | null>(null)
  const [editorDraft, setEditorDraft] = useState<BuyFormState | SellFormState | null>(null)
  const [buySelected, setBuySelected] = useState<string[]>([])
  const [sellSelected, setSellSelected] = useState<string[]>([])
  const [dangerDialog, setDangerDialog] = useState<{ title: string; warning: string; onConfirm: () => void } | null>(null)
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<DateRange>(defaultRange)
  const [sortKey, setSortKey] = useState<'date' | 'profit' | 'revenue' | 'buyRate' | 'sellRate'>('date')
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountDescription, setAccountDescription] = useState('')
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const deferredSearch = useDeferredValue(search)

  const currencyFormatter = (value: number) => formatMoney(value, state.settings.currencyFormat, state.settings.profitPrecision)
  const usdFormatter = (value: number) => formatUsd(value, state.settings.currencyFormat)

  const filteredBuys = useMemo(() => {
    const searchResult = applyTradeSearch(state, parseTradeSearchQuery(deferredSearch))
    return searchResult.buys.filter((buy) => {
      const timestamp = new Date(buy.dateTime).getTime()
      const inRange = timestamp >= new Date(range.start).getTime() && timestamp <= new Date(range.end).getTime()
      return inRange
    })
  }, [deferredSearch, range.end, range.start, state])

  const filteredSells = useMemo(() => {
    return applyTradeSearch(state, parseTradeSearchQuery(deferredSearch)).sells
      .filter((sell) => {
        const timestamp = new Date(sell.dateTime).getTime()
        const inRange = timestamp >= new Date(range.start).getTime() && timestamp <= new Date(range.end).getTime()
        return inRange
      })
      .sort((left, right) => {
        if (sortKey === 'profit') return right.profit - left.profit
        if (sortKey === 'revenue') return right.netRevenue - left.netRevenue
        if (sortKey === 'sellRate') return right.sellRate - left.sellRate
        if (sortKey === 'date') return new Date(right.dateTime).getTime() - new Date(left.dateTime).getTime()
        if (sortKey === 'buyRate') return right.buyCost - left.buyCost
        return 0
      })
  }, [deferredSearch, range.end, range.start, sortKey, state])

  const quickProfit = useMemo(() => {
    if (buyForm.buyRate <= 0 || sellForm.sellRate <= 0 || sellForm.usdSold <= 0) {
      return 0
    }

    const estimatedBuyCost = sellForm.usdSold * buyForm.buyRate
    const estimatedRevenue = sellForm.usdSold * sellForm.sellRate
    return estimatedRevenue - estimatedBuyCost
  }, [buyForm.buyRate, sellForm.sellRate, sellForm.usdSold])

  const handleBuySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = actions.saveBuy(buyForm)
    setStatusMessage(result.message ?? (result.ok ? 'Buy transaction saved.' : ''))
    if (result.ok) {
      setBuyForm(emptyBuyForm())
    }
  }

  const handleSellSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = actions.saveSell(sellForm)
    setStatusMessage(result.message ?? (result.ok ? 'Sell transaction saved.' : ''))
    if (result.ok) {
      setSellForm(emptySellForm())
    }
  }

  const reportRows = filteredSells.map((sell) => ({
    date: sell.dateTime,
    sellRate: sell.sellRate,
    usdSold: sell.usdSold,
    revenue: sell.netRevenue,
    buyCost: sell.buyCost,
    profit: sell.profit,
  }))

  const handleExport = (mode: 'json' | 'csv' | 'xlsx') => {
    if (mode === 'json') {
      actions.logExport('Exported JSON backup')
      exportBlob(`p2p-backup-${Date.now()}.json`, toJson(state), 'application/json')
      return
    }

    if (mode === 'csv') {
      actions.logExport('Exported CSV report')
      exportBlob(`p2p-report-${Date.now()}.csv`, toCsv(reportRows), 'text/csv')
      return
    }

    actions.logExport('Exported XLSX report')
    const workbook = toWorkbook(reportRows)
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    exportBlob(`p2p-report-${Date.now()}.xlsx`, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }

  const handlePdfExport = () => {
    actions.logExport('Exported PDF report')
    const pdf = new jsPDF()
    pdf.setFontSize(16)
    pdf.text('Binance P2P Profit Tracker Report', 14, 18)
    pdf.setFontSize(10)
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 26)
    reportRows.slice(0, 20).forEach((row, index) => {
      pdf.text(`${index + 1}. ${row.date} | Revenue ${row.revenue} | Profit ${row.profit}`, 14, 36 + index * 7)
    })
    pdf.save(`p2p-report-${Date.now()}.pdf`)
  }

  const handleImportBackup = async (file?: File | null) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as typeof state
      const result = actions.importState(parsed)
      setStatusMessage(result.message ?? (result.ok ? 'Backup imported successfully.' : ''))
    } catch {
      setStatusMessage('Backup import failed. The file is not valid JSON.')
    }
  }

  const openEditor = (kind: 'buy' | 'sell', mode: 'view' | 'edit', id: string) => {
    setEditor({ kind, mode, id })
    if (kind === 'buy') {
      const item = state.buys.find((entry) => entry.id === id)
      setEditorDraft(
        item
          ? {
              currency: item.currency,
              dateTime: item.dateTime,
              buyRate: item.buyRate,
              lkrAmountPaid: item.lkrAmountPaid,
              bankCharges: item.bankCharges,
              additionalCharges: item.additionalCharges,
              notes: item.notes,
              tags: item.tags.join(', '),
            }
          : null,
      )
      return
    }

    const item = state.sells.find((entry) => entry.id === id)
    setEditorDraft(
      item
        ? {
            currency: item.currency,
            dateTime: item.dateTime,
            sellRate: item.sellRate,
            usdSold: item.usdSold,
            bankCharges: item.bankCharges,
            additionalCharges: item.additionalCharges,
            notes: item.notes,
            tags: item.tags.join(', '),
          }
        : null,
    )
  }

  const closeEditor = () => {
    setEditor(null)
    setEditorDraft(null)
  }

  const confirmDelete = (title: string, warning: string, onConfirm: () => void) => {
    setDangerDialog({ title, warning, onConfirm })
  }

  const executeEditorSave = () => {
    if (!editor || !editorDraft) return

    if (editor.kind === 'buy') {
      const result = actions.updateBuyTransaction(editor.id, editorDraft as BuyFormState)
      setStatusMessage(result.message ?? (result.ok ? 'Buy transaction updated.' : ''))
      if (result.ok) closeEditor()
      return
    }

    const result = actions.updateSellTransaction(editor.id, editorDraft as SellFormState)
    setStatusMessage(result.message ?? (result.ok ? 'Sell transaction updated.' : ''))
    if (result.ok) closeEditor()
  }

  const bulkDeleteSelected = () => {
    const result = actions.deleteSelectedTransactions(buySelected, sellSelected)
    setStatusMessage(result.message ?? (result.ok ? 'Selected transactions deleted.' : ''))
    if (result.ok) {
      setBuySelected([])
      setSellSelected([])
    }
  }

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Lifetime Profit"
          value={currencyFormatter(analytics.dashboard.overall.lifetimeProfit)}
          trend={`${formatPercent(analytics.dashboard.overall.roiPercentage)} ROI`}
          detail="All realized profit across the active account"
          icon={<TrendingUp className="h-5 w-5" />}
          sparkline={analytics.dailyProfitSeries.slice(-8).map((entry) => entry.profit)}
          accent="from-emerald-400/22 via-emerald-400/8 to-transparent"
        />
        <MetricCard
          label="Current USD Balance"
          value={usdFormatter(analytics.dashboard.overall.remainingUsdBalance)}
          trend={`${formatPercent(analytics.dashboard.overall.winRate)} win rate`}
          detail="Open FIFO inventory available for allocation"
          icon={<WalletCards className="h-5 w-5" />}
          sparkline={analytics.usdBalanceSeries.slice(-8).map((entry) => entry.balance)}
          accent="from-sky-400/22 via-sky-400/8 to-transparent"
        />
        <MetricCard
          label="Monthly Profit"
          value={currencyFormatter(analytics.dashboard.currentMonth.profit)}
          trend={`${currencyFormatter(analytics.dashboard.last30Days.profit)} in the last 30 days`}
          detail="Current month realized performance"
          icon={<ArrowUpRight className="h-5 w-5" />}
          sparkline={analytics.monthlyProfitSeries.slice(-8).map((entry) => entry.profit)}
          accent="from-cyan-400/22 via-cyan-400/8 to-transparent"
        />
        <MetricCard
          label="Today's Profit"
          value={currencyFormatter(analytics.dashboard.today.profit)}
          trend={`${analytics.dashboard.today.count} trades today`}
          detail="Intraday realized result"
          icon={<Clock3 className="h-5 w-5" />}
          sparkline={analytics.dailyProfitSeries.slice(-8).map((entry) => entry.profit)}
          accent="from-fuchsia-400/22 via-fuchsia-400/8 to-transparent"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <SectionCard title="Daily Profit Chart" subtitle="Last 30 days profit movement">
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <AreaChart data={analytics.dailyProfitSeries}>
                <defs>
                  <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={(value) => format(new Date(value), 'dd MMM')} />
                <YAxis stroke="#94a3b8" tickFormatter={(value) => formatNumber(value)} />
                <Tooltip formatter={(value: number) => [currencyFormatter(value), 'Profit']} />
                <Area type="monotone" dataKey="profit" stroke="#22d3ee" fill="url(#profitGradient)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Live Stats" subtitle="Current state from local storage">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <MetricCard label="USD Balance" value={usdFormatter(analytics.dashboard.overall.remainingUsdBalance)} detail="Remaining inventory" accent="from-emerald-400/20 to-emerald-500/10" />
            <MetricCard label="Average Buy Rate" value={currencyFormatter(analytics.dashboard.overall.averageBuyRate)} detail="Weighted by inventory" accent="from-amber-400/20 to-amber-500/10" />
            <MetricCard label="Average Sell Rate" value={currencyFormatter(analytics.dashboard.overall.averageSellRate)} detail="Realized sales average" accent="from-fuchsia-400/20 to-fuchsia-500/10" />
            <MetricCard label="Profit / USD" value={currencyFormatter(analytics.dashboard.overall.profitPerUsd)} detail="Average realized margin" accent="from-sky-400/20 to-sky-500/10" />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Revenue vs Cost" subtitle="Daily net revenue compared with cost basis">
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <BarChart data={analytics.revenueVsCostSeries.slice(-14)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" stroke="#94a3b8" tickFormatter={(value) => format(new Date(value), 'dd')} />
                <YAxis stroke="#94a3b8" tickFormatter={(value) => formatNumber(value)} />
                <Tooltip formatter={(value: number, name: string) => [currencyFormatter(value), name]} />
                <Legend />
                <Bar dataKey="revenue" fill="#22d3ee" radius={[8, 8, 0, 0]} />
                <Bar dataKey="cost" fill="#fb7185" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="USD Balance Trend" subtitle="Rolling inventory balance approximation">
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <LineChart data={analytics.usdBalanceSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={(value) => format(new Date(value), 'dd MMM')} />
                <YAxis stroke="#94a3b8" tickFormatter={(value) => formatNumber(value)} />
                <Tooltip formatter={(value: number) => [usdFormatter(value), 'Balance']} />
                <Line type="monotone" dataKey="balance" stroke="#34d399" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Rate Comparison" subtitle="Average buy and sell rates per day">
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <LineChart data={analytics.buyRateSeries.map((point, index) => ({ date: point.date, buyRate: point.rate, sellRate: analytics.sellRateSeries[index]?.rate ?? 0 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={(value) => format(new Date(value), 'dd MMM')} />
                <YAxis stroke="#94a3b8" tickFormatter={(value) => formatNumber(value)} />
                <Tooltip formatter={(value: number) => [currencyFormatter(value), 'Rate']} />
                <Line type="monotone" dataKey="buyRate" stroke="#60a5fa" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="sellRate" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>
    </div>
  )

  const renderBuyPage = () => (
    <div className="space-y-4">
      <SectionCard title="Buy Transaction" subtitle="Capture inventory with live cost preview and quick correction tools">
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleBuySubmit}>
            <Field label="Date & Time">
              <input type="datetime-local" value={buyForm.dateTime} onChange={(event) => setBuyForm({ ...buyForm, dateTime: event.target.value })} />
            </Field>
            <Field label="Currency">
              <select value={buyForm.currency} onChange={(event) => setBuyForm({ ...buyForm, currency: event.target.value as BuyFormState['currency'] })}>
                {getCurrencyOptions().map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Buy Rate (LKR per USD)">
              <input type="number" min="0" step="0.01" value={buyForm.buyRate || ''} onChange={(event) => setBuyForm({ ...buyForm, buyRate: Number(event.target.value) })} />
            </Field>
            <Field label="LKR Amount Paid">
              <input type="number" min="0" step="0.01" value={buyForm.lkrAmountPaid || ''} onChange={(event) => setBuyForm({ ...buyForm, lkrAmountPaid: Number(event.target.value) })} />
            </Field>
            <Field label="Bank Charges">
              <input type="number" min="0" step="0.01" value={buyForm.bankCharges || ''} onChange={(event) => setBuyForm({ ...buyForm, bankCharges: Number(event.target.value) })} />
            </Field>
            <Field label="Additional Charges">
              <input type="number" min="0" step="0.01" value={buyForm.additionalCharges || ''} onChange={(event) => setBuyForm({ ...buyForm, additionalCharges: Number(event.target.value) })} />
            </Field>
            <Field label="Tags">
              <input type="text" value={buyForm.tags} onChange={(event) => setBuyForm({ ...buyForm, tags: event.target.value })} placeholder="urgent, preferred bank" />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea rows={4} value={buyForm.notes} onChange={(event) => setBuyForm({ ...buyForm, notes: event.target.value })} placeholder="Optional notes" />
            </Field>
            <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-200">USD Received</p>
                <p className="mt-2 text-2xl font-semibold text-white">{usdFormatter(buyForm.buyRate > 0 ? buyForm.lkrAmountPaid / buyForm.buyRate : 0)}</p>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Total Cost</p>
                <p className="mt-2 text-2xl font-semibold text-white">{currencyFormatter((buyForm.lkrAmountPaid || 0) + (buyForm.bankCharges || 0) + (buyForm.additionalCharges || 0))}</p>
              </div>
              <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-fuchsia-200">Effective Buy Rate</p>
                <p className="mt-2 text-2xl font-semibold text-white">{currencyFormatter(buyForm.buyRate > 0 && buyForm.lkrAmountPaid > 0 ? (buyForm.lkrAmountPaid + buyForm.bankCharges + buyForm.additionalCharges) / (buyForm.lkrAmountPaid / buyForm.buyRate) : 0)}</p>
              </div>
            </div>
            <button className="sm:col-span-2 rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300" type="submit">
              Save Buy Transaction
            </button>
          </form>

          <div className="space-y-3">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Recent Buys</p>
              <p className="mt-2 text-sm text-slate-300">Quick edit or delete mistakes without opening History.</p>
            </div>
            {state.buys.length === 0 ? (
              <EmptyState title="No buy entries yet" description="Your newest buy transactions will appear here with edit and delete actions." />
            ) : (
              <div className="space-y-3">
                {state.buys.slice(0, 4).map((buy) => (
                  <article key={buy.id} className="rounded-[24px] border border-white/10 bg-[var(--app-card-soft)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-white">{friendlyDateTime(buy.dateTime)}</p>
                        <p className="mt-1 text-xs text-slate-400">{buy.currency} • {buy.tags.length > 0 ? buy.tags.join(', ') : 'No tags'}</p>
                      </div>
                      <p className="text-right text-lg font-semibold text-emerald-300">{currencyFormatter(buy.totalCost)}</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => openEditor('buy', 'view', buy.id)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                      <button type="button" onClick={() => openEditor('buy', 'edit', buy.id)} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/15 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/25">
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button type="button" onClick={() => confirmDelete('Delete Buy Transaction', 'This action will recalculate inventory, profits, reports and analytics.', () => actions.deleteBuyTransaction(buy.id))} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/15 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/25">
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  )

  const renderSellPage = () => (
    <div className="space-y-4">
      <SectionCard title="Sell Transaction" subtitle="Allocate inventory using FIFO with a clear profit preview and fast correction tools">
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSellSubmit}>
            <Field label="Date & Time">
              <input type="datetime-local" value={sellForm.dateTime} onChange={(event) => setSellForm({ ...sellForm, dateTime: event.target.value })} />
            </Field>
            <Field label="Currency">
              <select value={sellForm.currency} onChange={(event) => setSellForm({ ...sellForm, currency: event.target.value as SellFormState['currency'] })}>
                {getCurrencyOptions().map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sell Rate (LKR per USD)">
              <input type="number" min="0" step="0.01" value={sellForm.sellRate || ''} onChange={(event) => setSellForm({ ...sellForm, sellRate: Number(event.target.value) })} />
            </Field>
            <Field label="USD Sold">
              <input type="number" min="0" step="0.01" value={sellForm.usdSold || ''} onChange={(event) => setSellForm({ ...sellForm, usdSold: Number(event.target.value) })} />
            </Field>
            <Field label="Bank Charges">
              <input type="number" min="0" step="0.01" value={sellForm.bankCharges || ''} onChange={(event) => setSellForm({ ...sellForm, bankCharges: Number(event.target.value) })} />
            </Field>
            <Field label="Additional Charges">
              <input type="number" min="0" step="0.01" value={sellForm.additionalCharges || ''} onChange={(event) => setSellForm({ ...sellForm, additionalCharges: Number(event.target.value) })} />
            </Field>
            <Field label="Tags">
              <input type="text" value={sellForm.tags} onChange={(event) => setSellForm({ ...sellForm, tags: event.target.value })} placeholder="arb, quick exit" />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea rows={4} value={sellForm.notes} onChange={(event) => setSellForm({ ...sellForm, notes: event.target.value })} placeholder="Optional notes" />
            </Field>
            <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Gross Revenue</p>
                <p className="mt-2 text-2xl font-semibold text-white">{currencyFormatter((sellForm.usdSold || 0) * (sellForm.sellRate || 0))}</p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-200">Net Revenue</p>
                <p className="mt-2 text-2xl font-semibold text-white">{currencyFormatter((sellForm.usdSold || 0) * (sellForm.sellRate || 0) - (sellForm.bankCharges || 0) - (sellForm.additionalCharges || 0))}</p>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-amber-200">Quick Profit Estimate</p>
                <p className="mt-2 text-2xl font-semibold text-white">{currencyFormatter(quickProfit)}</p>
              </div>
            </div>
            <button className="sm:col-span-2 rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300" type="submit">
              Save Sell Transaction
            </button>
          </form>

          <div className="space-y-3">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Recent Sells</p>
              <p className="mt-2 text-sm text-slate-300">Review, edit, or delete the latest trades right here.</p>
            </div>
            {state.sells.length === 0 ? (
              <EmptyState title="No sell entries yet" description="Your latest sells will appear here with edit and delete actions." />
            ) : (
              <div className="space-y-3">
                {state.sells.slice(0, 4).map((sell) => (
                  <article key={sell.id} className="rounded-[24px] border border-white/10 bg-[var(--app-card-soft)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-white">{friendlyDateTime(sell.dateTime)}</p>
                        <p className="mt-1 text-xs text-slate-400">{sell.currency} • {sell.tags.length > 0 ? sell.tags.join(', ') : 'No tags'}</p>
                      </div>
                      <p className={classNames('text-right text-lg font-semibold', sell.profit >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                        {currencyFormatter(sell.profit)}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => openEditor('sell', 'view', sell.id)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                      <button type="button" onClick={() => openEditor('sell', 'edit', sell.id)} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/15 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/25">
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button type="button" onClick={() => confirmDelete('Delete Sell Transaction', 'This action will recalculate inventory, profits, reports and analytics.', () => actions.deleteSellTransaction(sell.id))} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/15 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/25">
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  )

  const renderInventoryPage = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Available USD" value={usdFormatter(analytics.dashboard.overall.remainingUsdBalance)} detail="FIFO inventory balance" accent="from-emerald-400/20 to-emerald-500/10" />
        <MetricCard label="Average Buy Rate" value={currencyFormatter(statistics.averageBuyRate)} detail="Weighted on remaining lots" accent="from-amber-400/20 to-amber-500/10" />
        <MetricCard label="Total Cost Basis" value={currencyFormatter(statistics.totalBuyCost)} detail="Unrealized inventory value" accent="from-sky-400/20 to-sky-500/10" />
        <MetricCard label="FIFO Lots" value={String(state.inventoryLots.length)} detail="Open inventory records" accent="from-fuchsia-400/20 to-fuchsia-500/10" />
      </div>

      <SectionCard title="FIFO Inventory Lots" subtitle="Oldest purchases are consumed first when selling">
          {state.inventoryLots.length === 0 ? (
            <EmptyState
              title="No inventory yet"
              description="Add a buy transaction to start building FIFO inventory and profit analytics."
              action={<button type="button" onClick={() => setPage('buy')} className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300">Add Buy</button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="text-left text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Remaining USD</th>
                    <th className="px-3 py-3">Buy Rate</th>
                    <th className="px-3 py-3">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-white">
                  {state.inventoryLots.map((lot) => (
                    <tr key={lot.id}>
                      <td className="px-3 py-3">{friendlyDateTime(lot.dateTime)}</td>
                      <td className="px-3 py-3">{usdFormatter(lot.remainingUsd)}</td>
                      <td className="px-3 py-3">{currencyFormatter(lot.buyRate)}</td>
                      <td className="px-3 py-3">{currencyFormatter(lot.costBasis)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </SectionCard>
    </div>
  )

  const renderAnalyticsPage = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Lifetime Profit" value={currencyFormatter(analytics.dashboard.overall.lifetimeProfit)} detail="Total realized profit" />
        <MetricCard label="Total Revenue" value={currencyFormatter(analytics.dashboard.overall.totalRevenue)} detail="Net revenue after charges" />
        <MetricCard label="Total Investment" value={currencyFormatter(analytics.dashboard.overall.totalInvestment)} detail="All buy-side cost basis" />
        <MetricCard label="ROI" value={formatPercent(analytics.dashboard.overall.roiPercentage)} detail="Return on investment" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Win Rate" value={formatPercent(analytics.dashboard.overall.winRate)} detail="Profitable sell ratio" />
        <MetricCard label="Avg Profit / Trade" value={currencyFormatter(analytics.dashboard.overall.averageProfitPerTrade)} detail="Mean realized profit" />
        <MetricCard label="Fees Paid" value={currencyFormatter(analytics.dashboard.overall.totalFeesPaid)} detail="All recorded charges" />
        <MetricCard label="Inventory Value" value={currencyFormatter(analytics.dashboard.overall.currentUsdInventoryValue)} detail="Marked from current rate base" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Monthly Profit Chart" subtitle="Profit across months">
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <BarChart data={analytics.monthlyProfitSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={(value) => formatNumber(value)} />
                <Tooltip formatter={(value: number) => [currencyFormatter(value), 'Profit']} />
                <Bar dataKey="profit" radius={[10, 10, 0, 0]}>
                  {analytics.monthlyProfitSeries.map((entry, index) => (
                    <Cell key={entry.month} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Profit Forecast" subtitle="Simple forecast based on last 30 days">
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard label="Next Month Forecast" value={currencyFormatter(analytics.dashboard.overall.forecastNextMonthProfit)} detail="Estimated from recent momentum" />
            <MetricCard label="Monthly Growth" value={formatPercent(analytics.dashboard.overall.monthlyGrowthPercentage)} detail="Compared with previous month" />
            <MetricCard label="Best Trade" value={analytics.dashboard.overall.bestTrade ? currencyFormatter(analytics.dashboard.overall.bestTrade.profit) : 'N/A'} detail={analytics.dashboard.overall.bestTrade ? friendlyDateTime(analytics.dashboard.overall.bestTrade.dateTime) : 'No sales yet'} />
            <MetricCard label="Worst Trade" value={analytics.dashboard.overall.worstTrade ? currencyFormatter(analytics.dashboard.overall.worstTrade.profit) : 'N/A'} detail={analytics.dashboard.overall.worstTrade ? friendlyDateTime(analytics.dashboard.overall.worstTrade.dateTime) : 'No sales yet'} />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Profit Leaderboard" subtitle="Top months by realized profit">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {analytics.dashboard.overall.monthlyLeaderboard.map((entry, index) => (
            <article key={entry.month} className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Rank {index + 1}</p>
              <p className="mt-2 text-lg font-semibold text-white">{entry.month}</p>
              <p className="mt-3 text-2xl font-semibold text-cyan-300">{currencyFormatter(entry.profit)}</p>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Period Highlights" subtitle="Best observed day and month">
        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard label="Best Day" value={analytics.dashboard.overall.bestPerformingDay ? currencyFormatter(analytics.dashboard.overall.bestPerformingDay.profit) : 'N/A'} detail={analytics.dashboard.overall.bestPerformingDay?.date ?? 'No sales yet'} />
          <MetricCard label="Best Month" value={analytics.dashboard.overall.bestPerformingMonth ? currencyFormatter(analytics.dashboard.overall.bestPerformingMonth.profit) : 'N/A'} detail={analytics.dashboard.overall.bestPerformingMonth?.month ?? 'No sales yet'} />
        </div>
      </SectionCard>
    </div>
  )

  const renderActivityLogPage = () => (
    <div className="space-y-4">
      <SectionCard title="Activity Log" subtitle="Created, edited, deleted, imported, exported, restored, and cleared activity">
        {state.auditLog.length === 0 ? (
          <EmptyState title="No activity yet" description="Transactions, backups, exports, and archive actions will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="text-left text-slate-400">
                <tr>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Date & Time</th>
                  <th className="px-3 py-3">Transaction Type</th>
                  <th className="px-3 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white">
                {state.auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-3">{entry.action}</td>
                    <td className="px-3 py-3">{friendlyDateTime(entry.dateTime)}</td>
                    <td className="px-3 py-3">{entry.transactionType}</td>
                    <td className="px-3 py-3">{entry.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )

  const renderHistoryPage = () => {
    const allFilteredBuyIds = filteredBuys.map((buy) => buy.id)
    const allFilteredSellIds = filteredSells.map((sell) => sell.id)

    return (
      <div className="space-y-4">
        {undoSnapshot ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
            <span>{undoSnapshot.label} can be restored for a short time.</span>
            <button
              type="button"
              onClick={() => {
                const result = actions.undoLastDelete()
                setStatusMessage(result.message ?? (result.ok ? 'Delete undone.' : ''))
              }}
              className="rounded-2xl bg-amber-300 px-4 py-2 font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Undo Delete
            </button>
          </div>
        ) : null}

        <SectionCard title="Filters" subtitle="Search, sort, and narrow by date range">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Search">
              <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes, tags, values" />
            </Field>
            <Field label="Start Date">
              <input type="datetime-local" value={range.start} onChange={(event) => setRange({ ...range, start: event.target.value })} />
            </Field>
            <Field label="End Date">
              <input type="datetime-local" value={range.end} onChange={(event) => setRange({ ...range, end: event.target.value })} />
            </Field>
            <Field label="Sort">
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as typeof sortKey)}>
                <option value="date">Date</option>
                <option value="profit">Profit</option>
                <option value="revenue">Revenue</option>
                <option value="buyRate">Buy Rate</option>
                <option value="sellRate">Sell Rate</option>
              </select>
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Bulk Operations" subtitle="Delete selected records or clear an entire transaction set">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={bulkDeleteSelected}
              className="rounded-2xl bg-rose-500 px-4 py-3 font-semibold text-white transition hover:bg-rose-400"
            >
              Delete Selected
            </button>
            <button
              type="button"
              onClick={() => confirmDelete('Delete All Buy Transactions', 'This action will recalculate inventory, profits, reports and analytics.', () => actions.deleteAllBuyTransactions())}
              className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/15"
            >
              Delete All Buy Transactions
            </button>
            <button
              type="button"
              onClick={() => confirmDelete('Delete All Sell Transactions', 'This action will recalculate inventory, profits, reports and analytics.', () => actions.deleteAllSellTransactions())}
              className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/15"
            >
              Delete All Sell Transactions
            </button>
            <button
              type="button"
              onClick={() => confirmDelete('Delete All Transactions', 'This action will recalculate inventory, profits, reports and analytics.', () => actions.deleteAllTransactions())}
              className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/15"
            >
              Delete All Transactions
            </button>
          </div>
        </SectionCard>

        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Buy History" subtitle="View, edit, delete, or select buy transactions">
            <div className="mb-3 flex items-center justify-between text-sm text-slate-400">
              <span>{buySelected.length} selected</span>
              <button type="button" onClick={() => setBuySelected(allFilteredBuyIds)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                Select Visible
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="text-left text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Select</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Buy Rate</th>
                    <th className="px-3 py-3">LKR Amount</th>
                    <th className="px-3 py-3">Charges</th>
                    <th className="px-3 py-3">USD Received</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-white">
                  {filteredBuys.map((buy) => (
                    <tr key={buy.id}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={buySelected.includes(buy.id)}
                          onChange={(event) =>
                            setBuySelected((current) =>
                              event.target.checked ? [...current, buy.id] : current.filter((id) => id !== buy.id),
                            )
                          }
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-3 py-3">{friendlyDateTime(buy.dateTime)}</td>
                      <td className="px-3 py-3">{currencyFormatter(buy.buyRate)}</td>
                      <td className="px-3 py-3">{currencyFormatter(buy.lkrAmountPaid)}</td>
                      <td className="px-3 py-3">{currencyFormatter(buy.bankCharges + buy.additionalCharges)}</td>
                      <td className="px-3 py-3">{usdFormatter(buy.usdReceived)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => openEditor('buy', 'view', buy.id)} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/15">View</button>
                          <button type="button" onClick={() => openEditor('buy', 'edit', buy.id)} className="rounded-full bg-cyan-400 px-3 py-1 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300">Edit</button>
                          <button
                            type="button"
                            onClick={() => confirmDelete('Delete Buy Transaction', 'This action will recalculate inventory, profits, reports and analytics.', () => actions.deleteBuyTransaction(buy.id))}
                            className="rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-400"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Sell History" subtitle="View, edit, delete, or select sell transactions">
            <div className="mb-3 flex items-center justify-between text-sm text-slate-400">
              <span>{sellSelected.length} selected</span>
              <button type="button" onClick={() => setSellSelected(allFilteredSellIds)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                Select Visible
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="text-left text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Select</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Sell Rate</th>
                    <th className="px-3 py-3">USD Sold</th>
                    <th className="px-3 py-3">Revenue</th>
                    <th className="px-3 py-3">Buy Cost</th>
                    <th className="px-3 py-3">Profit</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-white">
                  {filteredSells.map((sell) => (
                    <tr key={sell.id}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={sellSelected.includes(sell.id)}
                          onChange={(event) =>
                            setSellSelected((current) =>
                              event.target.checked ? [...current, sell.id] : current.filter((id) => id !== sell.id),
                            )
                          }
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-3 py-3">{friendlyDateTime(sell.dateTime)}</td>
                      <td className="px-3 py-3">{currencyFormatter(sell.sellRate)}</td>
                      <td className="px-3 py-3">{usdFormatter(sell.usdSold)}</td>
                      <td className="px-3 py-3">{currencyFormatter(sell.netRevenue)}</td>
                      <td className="px-3 py-3">{currencyFormatter(sell.buyCost)}</td>
                      <td className={classNames('px-3 py-3 font-semibold', sell.profit >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                        {currencyFormatter(sell.profit)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => openEditor('sell', 'view', sell.id)} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/15">View</button>
                          <button type="button" onClick={() => openEditor('sell', 'edit', sell.id)} className="rounded-full bg-cyan-400 px-3 py-1 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300">Edit</button>
                          <button
                            type="button"
                            onClick={() => confirmDelete('Delete Sell Transaction', 'This action will recalculate inventory, profits, reports and analytics.', () => actions.deleteSellTransaction(sell.id))}
                            className="rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-400"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Audit Log" subtitle="Created, edited, deleted, imported, restored, and cleared activity">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="text-left text-slate-400">
                <tr>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Date & Time</th>
                  <th className="px-3 py-3">Transaction Type</th>
                  <th className="px-3 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white">
                {state.auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-3">{entry.action}</td>
                    <td className="px-3 py-3">{friendlyDateTime(entry.dateTime)}</td>
                    <td className="px-3 py-3">{entry.transactionType}</td>
                    <td className="px-3 py-3">{entry.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    )
  }

  const renderReportsPage = () => {
    const daily = buildDailyReport(state.buys, state.sells)
    const weekly = buildWeeklyReport(state.buys, state.sells)
    const monthly = buildMonthlyReport(state.buys, state.sells)
    const overall = buildOverallReport(state.buys, state.sells)

    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[daily, weekly, monthly, overall].map((report) => (
            <MetricCard key={report.label} label={report.label} value={currencyFormatter(report.summary.profit)} detail={`${report.summary.buys} buys • ${report.summary.sells} sells`} />
          ))}
        </div>

        <SectionCard title="Export Data" subtitle="Download reports and backups in the desired format">
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handlePdfExport} className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/15">Export PDF</button>
            <button type="button" onClick={() => handleExport('xlsx')} className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300">Export Excel</button>
            <button type="button" onClick={() => handleExport('csv')} className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/15">Export CSV</button>
            <button type="button" onClick={() => handleExport('json')} className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/15">Export JSON</button>
            <button type="button" onClick={() => actions.createManualBackup(`Manual backup ${format(new Date(), 'PPpp')}`)} className="rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300">Create Backup</button>
          </div>
        </SectionCard>

        <SectionCard title="Report Preview" subtitle="Custom date range analysis">
          <pre className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-950 p-4 text-sm text-slate-300">{JSON.stringify({ range, totalBuys: filteredBuys.length, totalSells: filteredSells.length, profit: filteredSells.reduce((sum, sell) => sum + sell.profit, 0) }, null, 2)}</pre>
        </SectionCard>
      </div>
    )
  }

  const renderSettingsPage = () => (
    <div className="space-y-4">
      <SectionCard title="Preferences" subtitle="Configure display, backup, and theme behavior">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency Format">
            <select value={state.settings.currencyFormat} onChange={(event) => actions.setCurrencyFormat(event.target.value as 'standard' | 'compact')}>
              <option value="standard">Standard</option>
              <option value="compact">Compact</option>
            </select>
          </Field>
          <Field label="Theme">
            <select value={state.settings.theme} onChange={(event) => actions.setTheme(event.target.value as 'dark' | 'light')}>
              <option value="dark">Dark Mode</option>
              <option value="light">Light Mode</option>
            </select>
          </Field>
          <Field label="Default Currency">
            <select value={state.settings.defaultCurrency} onChange={(event) => actions.setDefaultCurrency(event.target.value as 'USD' | 'EUR' | 'GBP' | 'AED' | 'USDT')}>
              {getCurrencyOptions().map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </Field>
          <Field label="Default Theme">
            <select value={state.settings.defaultTheme} onChange={(event) => actions.setDefaultTheme(event.target.value as 'dark' | 'light')}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </Field>
          <Field label="Export Preference">
            <select value={state.settings.exportPreference} onChange={(event) => actions.setExportPreference(event.target.value as 'pdf' | 'xlsx' | 'csv' | 'json')}>
              <option value="pdf">PDF</option>
              <option value="xlsx">Excel</option>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </Field>
          <Field label="Backup Preference">
            <select value={state.settings.backupPreference} onChange={(event) => actions.setBackupPreference(event.target.value as 'auto' | 'manual')}>
              <option value="auto">Automatic</option>
              <option value="manual">Manual</option>
            </select>
          </Field>
              <Field label="Profit Precision">
                <input type="number" min="0" max="6" value={state.settings.profitPrecision} onChange={(event) => actions.setProfitPrecision(Number(event.target.value))} />
              </Field>
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 sm:col-span-2">
            <input type="checkbox" checked={state.settings.autoBackup} onChange={(event) => actions.setAutoBackup(event.target.checked)} />
            Auto backup before changes
          </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 sm:col-span-2">
                <input type="checkbox" checked={state.settings.encryptBackups} onChange={(event) => actions.setBackupEncryption(event.target.checked)} />
                Encrypt backups in the browser session
              </label>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button type="button" onClick={() => actions.resetAnalytics()} className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/15">Reset Analytics</button>
            <button type="button" onClick={() => actions.createManualBackup(`Settings snapshot ${format(new Date(), 'PPpp')}`)} className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300">Save Snapshot</button>
            <button type="button" onClick={() => setConfirmationOpen(true)} className="rounded-2xl bg-rose-500 px-4 py-3 font-semibold text-white transition hover:bg-rose-400">Clear All Data</button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Cloud Sync Preparation" subtitle="Local storage now, cloud backends later">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider">
            <select value={state.cloudSync.provider} onChange={(event) => actions.updateCloudSync({ ...state.cloudSync, provider: event.target.value as 'local' | 'firebase' | 'supabase' | 'postgres' | 'github-gist' })}>
              <option value="local">Local Storage</option>
              <option value="firebase">Firebase</option>
              <option value="supabase">Supabase</option>
              <option value="postgres">PostgreSQL API</option>
              <option value="github-gist">GitHub Gist</option>
            </select>
          </Field>
          <Field label="Gist ID">
            <input value={state.cloudSync.gistId ?? ''} onChange={(event) => actions.updateCloudSync({ ...state.cloudSync, gistId: event.target.value })} placeholder="GitHub Gist id" />
          </Field>
          <Field label="GitHub Token">
            <input value={state.cloudSync.accessToken ?? ''} onChange={(event) => actions.updateCloudSync({ ...state.cloudSync, accessToken: event.target.value })} placeholder="ghp_..." />
          </Field>
          <Field label="File Name">
            <input value={state.cloudSync.fileName ?? ''} onChange={(event) => actions.updateCloudSync({ ...state.cloudSync, fileName: event.target.value })} placeholder="p2p-backup.json" />
          </Field>
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 sm:col-span-2">
            <input type="checkbox" checked={state.cloudSync.enabled} onChange={(event) => actions.updateCloudSync({ ...state.cloudSync, enabled: event.target.checked })} />
            Enable GitHub Gist cloud save
          </label>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button type="button" onClick={async () => setStatusMessage((await actions.syncToCloud()).message ?? '')} className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300">
              Save to Gist
            </button>
            <button type="button" onClick={async () => setStatusMessage((await actions.loadFromCloud()).message ?? '')} className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/15">
              Load from Gist
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Notifications" subtitle="Operational alerts and reminders">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.notifications.length === 0 ? <p className="text-sm text-slate-400">No notifications yet.</p> : null}
          {state.notifications.map((notification) => (
            <article key={notification.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="font-semibold text-white">{notification.title}</p>
              <p className="mt-2 text-sm text-slate-400">{notification.message}</p>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Backup & Restore" subtitle="Import a JSON backup or roll back to a previous snapshot">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/20 bg-white/5 p-6 text-center text-slate-300 transition hover:bg-white/10">
            <span className="text-lg font-semibold text-white">Import Backup JSON</span>
            <span className="text-sm text-slate-400">Upload a previously exported JSON file.</span>
            <input type="file" accept="application/json" className="hidden" onChange={(event) => handleImportBackup(event.target.files?.[0] ?? null)} />
          </label>

          <div className="space-y-3">
            {state.backups.length === 0 ? <p className="text-sm text-slate-400">No backups stored yet.</p> : null}
            {state.backups.map((backup) => (
              <div key={backup.id} className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-white">{backup.label}</p>
                  <p className="text-sm text-slate-400">{friendlyDateTime(backup.createdAt)}</p>
                </div>
                <button type="button" onClick={() => {
                  const result = actions.restoreBackup(backup.id)
                  setStatusMessage(result.message ?? (result.ok ? 'Backup restored.' : ''))
                }} className="rounded-2xl bg-white/10 px-4 py-2 font-semibold text-white transition hover:bg-white/15">
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  )

  const renderAccountsPage = () => (
    <div className="space-y-4">
      <SectionCard title="Account Management" subtitle="Create and switch Binance accounts instantly">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <Field label="Account Name">
            <input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Main Account" />
          </Field>
          <Field label="Description">
            <input value={accountDescription} onChange={(event) => setAccountDescription(event.target.value)} placeholder="Primary business account" />
          </Field>
          <button
            type="button"
            onClick={() => {
              if (!accountName.trim()) return
              actions.createAccount(accountName.trim(), accountDescription.trim())
              setAccountName('')
              setAccountDescription('')
              setStatusMessage('Account created and activated.')
            }}
            className="self-end rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            Add Account
          </button>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-3">
        {state.accounts.map((account) => (
          <article key={account.id} className={classNames('rounded-3xl border p-4', state.activeAccountId === account.id ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-white/10 bg-white/5')}>
            <p className="text-lg font-semibold text-white">{account.name}</p>
            <p className="mt-2 text-sm text-slate-400">{account.description}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">{state.activeAccountId === account.id ? 'Active account' : 'Inactive'}</p>
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => actions.setActiveAccount(account.id)} className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
                Switch
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )

  const renderGoalsPage = () => {
    const monthlyProfit = analytics.dashboard.currentMonth.profit
    return (
      <div className="space-y-4">
        <SectionCard title="Goal Tracking" subtitle="Track monthly, annual, and revenue targets">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Monthly Profit" value={currencyFormatter(monthlyProfit)} detail="Current month realized profit" />
            <MetricCard label="Annual Profit" value={currencyFormatter(analytics.dashboard.overall.lifetimeProfit)} detail="Lifetime profit baseline" />
            <MetricCard label="Revenue" value={currencyFormatter(analytics.dashboard.overall.totalRevenue)} detail="Realized revenue" />
            <MetricCard label="Targets" value={String(state.goals.length)} detail="Saved goals" />
          </div>
        </SectionCard>
        <SectionCard title="Create Goal" subtitle="Define a target and track progress">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <Field label="Goal Name">
              <input value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="Monthly Profit Goal" />
            </Field>
            <Field label="Target Amount">
              <input value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} type="number" min="0" step="0.01" />
            </Field>
            <Field label="Currency">
              <select defaultValue={state.settings.defaultCurrency}>
                {getCurrencyOptions().map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </Field>
            <button
              type="button"
              onClick={() => {
                if (!goalName.trim() || Number(goalTarget) <= 0) return
                actions.saveGoal({
                  id: `goal-${Date.now()}`,
                  name: goalName.trim(),
                  type: 'monthly-profit',
                  targetAmount: Number(goalTarget),
                  currentAmount: monthlyProfit,
                  startDate: new Date().toISOString(),
                  targetDate: new Date(Date.now() + 30 * 86400000).toISOString(),
                  accountId: state.activeAccountId,
                  currency: state.settings.defaultCurrency,
                })
                setGoalName('')
                setGoalTarget('')
                setStatusMessage('Goal saved.')
              }}
              className="self-end rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Save Goal
            </button>
          </div>
        </SectionCard>
        <div className="grid gap-4 xl:grid-cols-2">
          {state.goals.map((goal) => (
            <article key={goal.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-lg font-semibold text-white">{goal.name}</p>
              <p className="mt-2 text-sm text-slate-400">Target {currencyFormatter(goal.targetAmount)} | Current {currencyFormatter(goal.currentAmount)}</p>
              <p className="mt-3 text-xs text-slate-500">{goal.currency} • {goal.type}</p>
            </article>
          ))}
        </div>
      </div>
    )
  }

  const renderForecastingPage = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Monthly Profit Forecast" value={currencyFormatter(analytics.dashboard.overall.forecastNextMonthProfit)} detail="Trend based projection" />
        <MetricCard label="Revenue Forecast" value={currencyFormatter(analytics.dashboard.overall.totalRevenue * 1.05)} detail="Simple growth assumption" />
        <MetricCard label="Growth Forecast" value={formatPercent(analytics.dashboard.overall.monthlyGrowthPercentage)} detail="Current growth rate" />
        <MetricCard label="Inventory Value" value={currencyFormatter(analytics.dashboard.overall.currentUsdInventoryValue)} detail="Available inventory basis" />
      </div>
      <SectionCard title="Prediction Chart" subtitle="Revenue and profit trend projection">
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <LineChart data={analytics.dailyProfitSeries.slice(-14).map((point, index) => ({ day: point.date, profit: point.profit, forecast: point.profit * (1 + index * 0.01) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={(value) => formatNumber(value)} />
              <Tooltip formatter={(value: number) => [currencyFormatter(value), 'Value']} />
              <Legend />
              <Line type="monotone" dataKey="profit" stroke="#22d3ee" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="forecast" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
    </div>
  )

  const renderArchivePage = () => (
    <div className="space-y-4">
      <SectionCard title="Data Archive" subtitle="Archive, restore, or permanently clear old transactions">
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => actions.archiveCurrentAccountTransactions()} className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/15">
            Archive Active Account
          </button>
          <button type="button" onClick={() => actions.restoreArchive()} className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300">
            Restore Archive
          </button>
          <button type="button" onClick={() => actions.clearArchive()} className="rounded-2xl bg-rose-500 px-4 py-3 font-semibold text-white transition hover:bg-rose-400">
            Delete Archive Permanently
          </button>
        </div>
      </SectionCard>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Archived Buys" value={String(state.archive.buys.length)} detail="Stored in archive" />
        <MetricCard label="Archived Sells" value={String(state.archive.sells.length)} detail="Stored in archive" />
        <MetricCard label="Accounts" value={String(state.accounts.length)} detail="Active enterprise accounts" />
        <MetricCard label="Notifications" value={String(state.notifications.length)} detail="Queued alerts" />
      </div>
    </div>
  )

  const renderAdvancedAnalyticsPage = () => {
    const heatmapData = analytics.dailyProfitSeries.slice(-35)
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Total Trades" value={String(analytics.dashboard.overall.totalTransactionCount)} detail="All buy and sell transactions" />
          <MetricCard label="Winning Trades" value={String(state.sells.filter((sell) => sell.profit > 0).length)} detail="Positive profit sells" />
          <MetricCard label="Losing Trades" value={String(state.sells.filter((sell) => sell.profit <= 0).length)} detail="Breakeven or loss sells" />
          <MetricCard label="Win Rate" value={formatPercent(analytics.dashboard.overall.winRate)} detail="Win / total" />
          <MetricCard label="Profit Factor" value={formatNumber(state.sells.filter((sell) => sell.profit > 0).reduce((sum, sell) => sum + sell.profit, 0) / Math.max(1, Math.abs(state.sells.filter((sell) => sell.profit <= 0).reduce((sum, sell) => sum + sell.profit, 0))))} detail="Gross wins divided by gross losses" />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Profit Heatmap" subtitle="Recent profit intensity">
            <div className="grid grid-cols-7 gap-2">
              {heatmapData.map((point) => (
                <div key={point.date} className={classNames('rounded-2xl p-3 text-center text-xs font-semibold', point.profit > 0 ? 'bg-emerald-400/20 text-emerald-100' : point.profit < 0 ? 'bg-rose-400/20 text-rose-100' : 'bg-white/5 text-slate-300')}>
                  <div>{point.date.slice(-2)}</div>
                  <div className="mt-1">{currencyFormatter(point.profit)}</div>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Fee Analysis" subtitle="Recorded charges across the active account">
            <MetricCard label="Total Fees Paid" value={currencyFormatter(analytics.dashboard.overall.totalFeesPaid)} detail="Bank and additional charges" />
            <MetricCard label="Average Profit / Trade" value={currencyFormatter(analytics.dashboard.overall.averageProfitPerTrade)} detail="Mean realized profit" />
            <MetricCard label="Average Trade Size" value={usdFormatter(analytics.dashboard.overall.averageTradeSize)} detail="Mean USD sold" />
          </SectionCard>
        </div>
      </div>
    )
  }

  const pageTitle = {
    dashboard: 'Dashboard',
    buy: 'Buy Transaction',
    sell: 'Sell Transaction',
    inventory: 'Inventory',
    analytics: 'Analytics',
    history: 'History',
    'activity-log': 'Activity Log',
    archive: 'Archive',
    reports: 'Reports',
    settings: 'Settings',
    accounts: 'Accounts',
    goals: 'Goals',
    forecasting: 'Forecasting',
    'advanced-analytics': 'Professional Analytics',
  }[page]

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_30%),linear-gradient(180deg,#020617_0%,#050816_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] gap-4 px-3 pb-24 pt-3 sm:px-4 xl:px-6 xl:pb-6">
        <Navigation currentPage={page} onNavigate={setPage} />

        <main className="flex-1 space-y-5 overflow-hidden">
          <header className="sticky top-0 z-30 rounded-[28px] border border-white/10 bg-slate-950/80 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">Binance P2P Profit Tracker</p>
                <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{pageTitle}</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">Track buy and sell transactions, compute FIFO-based profit, and keep inventory, reports, analytics, backups, and settings in local storage.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="Active Account">
                  <select value={state.activeAccountId} onChange={(event) => actions.setActiveAccount(event.target.value)}>
                    {state.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs text-slate-400">Total Profit</p>
                  <p className="text-lg font-semibold text-emerald-300">{currencyFormatter(analytics.dashboard.overall.totalProfit)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs text-slate-400">USD Balance</p>
                  <p className="text-lg font-semibold text-cyan-300">{usdFormatter(analytics.dashboard.overall.remainingUsdBalance)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs text-slate-400">Transactions</p>
                  <p className="text-lg font-semibold text-white">{analytics.dashboard.overall.totalTransactionCount}</p>
                </div>
              </div>
            </div>
          </header>

          {statusMessage ? <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">{statusMessage}</div> : null}

          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="space-y-5"
            >
              {page === 'dashboard' ? renderDashboard() : null}
              {page === 'buy' ? renderBuyPage() : null}
              {page === 'sell' ? renderSellPage() : null}
              {page === 'inventory' ? renderInventoryPage() : null}
              {page === 'analytics' ? renderAnalyticsPage() : null}
              {page === 'history' ? renderHistoryPage() : null}
              {page === 'activity-log' ? renderActivityLogPage() : null}
              {page === 'archive' ? renderArchivePage() : null}
              {page === 'reports' ? renderReportsPage() : null}
              {page === 'settings' ? renderSettingsPage() : null}
              {page === 'accounts' ? renderAccountsPage() : null}
              {page === 'goals' ? renderGoalsPage() : null}
              {page === 'forecasting' ? renderForecastingPage() : null}
              {page === 'advanced-analytics' ? renderAdvancedAnalyticsPage() : null}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <Modal open={confirmationOpen} title="Clear All Data" description='Are you sure? This will permanently delete all buy transactions, sell transactions, analytics, inventory records, backups, and settings.' onClose={() => setConfirmationOpen(false)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setConfirmationOpen(false)} className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/15">Cancel</button>
          <button
            type="button"
            onClick={() => {
              actions.clearAllData()
              setConfirmationOpen(false)
              setStatusMessage('All data cleared.')
              setPage('dashboard')
            }}
            className="rounded-2xl bg-rose-500 px-4 py-3 font-semibold text-white transition hover:bg-rose-400"
          >
            Clear Data
          </button>
        </div>
      </Modal>

      <Modal
        open={dangerDialog !== null}
        title={dangerDialog?.title ?? 'Confirm Action'}
        description={dangerDialog?.warning ?? ''}
        onClose={() => setDangerDialog(null)}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setDangerDialog(null)} className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/15">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              dangerDialog?.onConfirm()
              setDangerDialog(null)
              setStatusMessage('Transaction deleted and data recalculated.')
            }}
            className="rounded-2xl bg-rose-500 px-4 py-3 font-semibold text-white transition hover:bg-rose-400"
          >
            Confirm Delete
          </button>
        </div>
      </Modal>

      <Modal
        open={editor !== null && editorDraft !== null}
        title={editor?.mode === 'edit' ? `Edit ${editor?.kind === 'buy' ? 'Buy' : 'Sell'} Transaction` : `View ${editor?.kind === 'buy' ? 'Buy' : 'Sell'} Transaction`}
        description="Changes recalculate inventory, reports, analytics, and charts automatically."
        onClose={closeEditor}
      >
        {editor?.kind === 'buy' && editorDraft && 'buyRate' in editorDraft ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date & Time">
              <input
                type="datetime-local"
                disabled={editor.mode === 'view'}
                value={editorDraft.dateTime}
                onChange={(event) => setEditorDraft({ ...editorDraft, dateTime: event.target.value })}
              />
            </Field>
            <Field label="Currency">
              <select disabled={editor.mode === 'view'} value={editorDraft.currency} onChange={(event) => setEditorDraft({ ...editorDraft, currency: event.target.value as BuyFormState['currency'] })}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="AED">AED</option>
                <option value="USDT">USDT</option>
              </select>
            </Field>
            <Field label="Buy Rate (LKR per USD)">
              <input type="number" disabled={editor.mode === 'view'} min="0" step="0.01" value={editorDraft.buyRate || ''} onChange={(event) => setEditorDraft({ ...editorDraft, buyRate: Number(event.target.value) })} />
            </Field>
            <Field label="LKR Amount Paid">
              <input type="number" disabled={editor.mode === 'view'} min="0" step="0.01" value={editorDraft.lkrAmountPaid || ''} onChange={(event) => setEditorDraft({ ...editorDraft, lkrAmountPaid: Number(event.target.value) })} />
            </Field>
            <Field label="Bank Charges">
              <input type="number" disabled={editor.mode === 'view'} min="0" step="0.01" value={editorDraft.bankCharges || ''} onChange={(event) => setEditorDraft({ ...editorDraft, bankCharges: Number(event.target.value) })} />
            </Field>
            <Field label="Additional Charges">
              <input type="number" disabled={editor.mode === 'view'} min="0" step="0.01" value={editorDraft.additionalCharges || ''} onChange={(event) => setEditorDraft({ ...editorDraft, additionalCharges: Number(event.target.value) })} />
            </Field>
            <Field label="Tags">
              <input type="text" disabled={editor.mode === 'view'} value={editorDraft.tags} onChange={(event) => setEditorDraft({ ...editorDraft, tags: event.target.value })} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea rows={4} disabled={editor.mode === 'view'} value={editorDraft.notes} onChange={(event) => setEditorDraft({ ...editorDraft, notes: event.target.value })} />
            </Field>
          </div>
        ) : null}

        {editor?.kind === 'sell' && editorDraft && 'sellRate' in editorDraft ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date & Time">
              <input
                type="datetime-local"
                disabled={editor.mode === 'view'}
                value={editorDraft.dateTime}
                onChange={(event) => setEditorDraft({ ...editorDraft, dateTime: event.target.value })}
              />
            </Field>
            <Field label="Currency">
              <select disabled={editor.mode === 'view'} value={editorDraft.currency} onChange={(event) => setEditorDraft({ ...editorDraft, currency: event.target.value as SellFormState['currency'] })}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="AED">AED</option>
                <option value="USDT">USDT</option>
              </select>
            </Field>
            <Field label="Sell Rate (LKR per USD)">
              <input type="number" disabled={editor.mode === 'view'} min="0" step="0.01" value={editorDraft.sellRate || ''} onChange={(event) => setEditorDraft({ ...editorDraft, sellRate: Number(event.target.value) })} />
            </Field>
            <Field label="USD Sold">
              <input type="number" disabled={editor.mode === 'view'} min="0" step="0.01" value={editorDraft.usdSold || ''} onChange={(event) => setEditorDraft({ ...editorDraft, usdSold: Number(event.target.value) })} />
            </Field>
            <Field label="Bank Charges">
              <input type="number" disabled={editor.mode === 'view'} min="0" step="0.01" value={editorDraft.bankCharges || ''} onChange={(event) => setEditorDraft({ ...editorDraft, bankCharges: Number(event.target.value) })} />
            </Field>
            <Field label="Additional Charges">
              <input type="number" disabled={editor.mode === 'view'} min="0" step="0.01" value={editorDraft.additionalCharges || ''} onChange={(event) => setEditorDraft({ ...editorDraft, additionalCharges: Number(event.target.value) })} />
            </Field>
            <Field label="Tags">
              <input type="text" disabled={editor.mode === 'view'} value={editorDraft.tags} onChange={(event) => setEditorDraft({ ...editorDraft, tags: event.target.value })} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea rows={4} disabled={editor.mode === 'view'} value={editorDraft.notes} onChange={(event) => setEditorDraft({ ...editorDraft, notes: event.target.value })} />
            </Field>
          </div>
        ) : null}

        {editorDraft ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">Audit log and charts update automatically</span>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={closeEditor} className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/15">
            Close
          </button>
          {editor?.mode === 'edit' ? (
            <button type="button" onClick={executeEditorSave} className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300">
              Save Changes
            </button>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}

export default App

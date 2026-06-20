import { addDays, startOfDay } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import type {
  Account,
  AppSettings,
  AuditAction,
  AuditLogEntry,
  ArchivedTransactionGroup,
  BackupSnapshot,
  BuyFormState,
  BuyTransaction,
  CloudSyncConfig,
  PersistedState,
  SavedFilter,
  Goal,
  NotificationItem,
  InventoryLot,
  SellAllocation,
  SellFormState,
  SellTransaction,
  UndoSnapshot,
  SupportedCurrency,
  ValidationResult,
} from '../types'
import { applyFifoSell, buildInventoryLot, getAvailableUsd } from '../utils/fifo'
import { createId } from '../utils/ids'
import { clearPersistedState, loadPersistedState, persistState } from '../utils/storage'

const defaultSettings: AppSettings = {
  theme: 'dark',
  currencyFormat: 'standard',
  autoBackup: true,
  profitPrecision: 2,
  encryptBackups: false,
  defaultCurrency: 'USD',
  defaultTheme: 'dark',
  exportPreference: 'xlsx',
  backupPreference: 'auto',
}

const defaultAccount: Account = {
  id: 'account-main',
  name: 'Main Account',
  description: 'Primary Binance account',
  isArchived: false,
  createdAt: new Date().toISOString(),
}

const createEmptyState = (): PersistedState => ({
  accounts: [defaultAccount],
  activeAccountId: defaultAccount.id,
  buys: [],
  sells: [],
  inventoryLots: [],
  archive: { buys: [], sells: [] } as ArchivedTransactionGroup,
  backups: [],
  auditLog: [],
  goals: [],
  savedFilters: [],
  notifications: [],
  cloudSync: { provider: 'local', enabled: false },
  settings: defaultSettings,
})

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

const normalizePersistedState = (state: PersistedState): PersistedState => ({
  ...createEmptyState(),
  ...state,
  accounts: asArray<Account>(state.accounts),
  buys: asArray<BuyTransaction>(state.buys),
  sells: asArray<SellTransaction>(state.sells),
  inventoryLots: asArray(state.inventoryLots),
  archive: {
    buys: asArray<BuyTransaction>(state.archive?.buys),
    sells: asArray<SellTransaction>(state.archive?.sells),
  },
  backups: asArray<BackupSnapshot>(state.backups).map((backup) => ({
    ...backup,
    state: normalizePersistedState(backup.state),
  })),
  auditLog: asArray<AuditLogEntry>(state.auditLog),
  goals: asArray<Goal>(state.goals),
  savedFilters: asArray<SavedFilter>(state.savedFilters),
  notifications: asArray<NotificationItem>(state.notifications),
  cloudSync: state.cloudSync ?? createEmptyState().cloudSync,
  settings: {
    ...defaultSettings,
    ...(state.settings ?? {}),
  },
})

const cloneState = (state: PersistedState): PersistedState => ({
  ...state,
  accounts: asArray<Account>(state.accounts).map((entry) => ({ ...entry })),
  buys: asArray<BuyTransaction>(state.buys).map((entry) => ({ ...entry, tags: asArray<string>(entry.tags) })),
  sells: asArray<SellTransaction>(state.sells).map((entry) => ({ ...entry, tags: asArray<string>(entry.tags), allocations: asArray<SellAllocation>(entry.allocations).map((allocation) => ({ ...allocation })) })),
  inventoryLots: asArray<InventoryLot>(state.inventoryLots).map((entry) => ({ ...entry })),
  archive: {
    buys: asArray<BuyTransaction>(state.archive?.buys).map((entry) => ({ ...entry, tags: asArray<string>(entry.tags) })),
    sells: asArray<SellTransaction>(state.archive?.sells).map((entry) => ({ ...entry, tags: asArray<string>(entry.tags), allocations: asArray<SellAllocation>(entry.allocations).map((allocation) => ({ ...allocation })) })),
  },
  backups: asArray<BackupSnapshot>(state.backups).map((backup) => ({ ...backup, state: cloneState(normalizePersistedState(backup.state)) })),
  auditLog: asArray<AuditLogEntry>(state.auditLog).map((entry) => ({ ...entry })),
  goals: asArray<Goal>(state.goals).map((entry) => ({ ...entry })),
  savedFilters: asArray<SavedFilter>(state.savedFilters).map((entry) => ({ ...entry })),
  notifications: asArray<NotificationItem>(state.notifications).map((entry) => ({ ...entry })),
  cloudSync: { ...createEmptyState().cloudSync, ...(state.cloudSync ?? {}) },
  settings: { ...defaultSettings, ...(state.settings ?? {}) },
})

const parseTags = (value: string) => value.split(',').map((tag) => tag.trim()).filter(Boolean)
const isPositiveNumber = (value: number) => Number.isFinite(value) && value > 0

const addBackupIfEnabled = (previous: PersistedState, next: PersistedState, label: string) => {
  if (!previous.settings.autoBackup) {
    return next
  }

  const snapshot: BackupSnapshot = { id: createId('backup'), createdAt: new Date().toISOString(), label, state: cloneState(previous) }
  return { ...next, backups: [snapshot, ...next.backups].slice(0, 20) }
}

const addAuditEntry = (state: PersistedState, action: AuditAction, transactionType: 'Buy' | 'Sell' | 'System', details: string) => {
  const entry: AuditLogEntry = {
    id: createId('audit'),
    action,
    dateTime: new Date().toISOString(),
    transactionType,
    details,
  }

  return { ...state, auditLog: [entry, ...state.auditLog].slice(0, 200) }
}

const sortByDateTime = <T extends { dateTime: string; id: string }>(items: T[]) =>
  [...items].sort((left, right) => {
    const timeDelta = new Date(left.dateTime).getTime() - new Date(right.dateTime).getTime()
    return timeDelta !== 0 ? timeDelta : left.id.localeCompare(right.id)
  })

const normalizeCurrency = (currency?: string): SupportedCurrency => {
  if (currency === 'EUR' || currency === 'GBP' || currency === 'AED' || currency === 'USDT') {
    return currency
  }

  return 'USD'
}

const normalizeBuy = (buy: BuyTransaction, accountId: string, currency?: string): BuyTransaction => ({
  ...buy,
  accountId: buy.accountId ?? accountId,
  currency: normalizeCurrency(buy.currency ?? currency),
})

const normalizeSell = (sell: SellTransaction, accountId: string, currency?: string): SellTransaction => ({
  ...sell,
  accountId: sell.accountId ?? accountId,
  currency: normalizeCurrency(sell.currency ?? currency),
})

const deriveState = (baseState: PersistedState): PersistedState => {
  const activeAccountId = baseState.activeAccountId || baseState.accounts[0]?.id || defaultAccount.id
  const buys = sortByDateTime(baseState.buys.map((buy) => normalizeBuy(buy, activeAccountId, baseState.settings.defaultCurrency))).filter((buy) => buy.accountId === activeAccountId).map((buy) => {
    const usdReceived = buy.lkrAmountPaid / buy.buyRate
    const totalCost = buy.lkrAmountPaid + buy.bankCharges + buy.additionalCharges
    return {
      ...buy,
      tags: [...buy.tags],
      usdReceived,
      totalCost,
      effectiveBuyRate: usdReceived > 0 ? totalCost / usdReceived : 0,
    }
  })

  const buyLots = buys.map((buy) => buildInventoryLot(buy))
  const sellsSorted = sortByDateTime(baseState.sells.map((sell) => normalizeSell(sell, activeAccountId, baseState.settings.defaultCurrency))).filter((sell) => sell.accountId === activeAccountId)
  let inventoryLots = buyLots.map((lot) => ({ ...lot }))
  const sells: SellTransaction[] = []

  for (const sell of sellsSorted) {
    const allocation = applyFifoSell(inventoryLots, sell.usdSold)
    const grossRevenue = sell.usdSold * sell.sellRate
    const netRevenue = grossRevenue - sell.bankCharges - sell.additionalCharges
    const profit = netRevenue - allocation.buyCost
    const profitPercent = allocation.buyCost > 0 ? (profit / allocation.buyCost) * 100 : 0
    sells.push({
      ...sell,
      tags: [...sell.tags],
      grossRevenue,
      netRevenue,
      buyCost: allocation.buyCost,
      profit,
      profitPercent,
      allocations: allocation.allocations,
    })
    inventoryLots = allocation.inventoryLots
  }

  return {
    ...baseState,
    buys,
    sells,
    inventoryLots,
  }
}

const findBuy = (state: PersistedState, id: string) => state.buys.find((entry) => entry.id === id)
const findSell = (state: PersistedState, id: string) => state.sells.find((entry) => entry.id === id)

const deleteIds = <T extends { id: string }>(items: T[], ids: string[]) => items.filter((item) => !ids.includes(item.id))

const totalBoughtUsd = (state: PersistedState) => state.buys.reduce((sum, buy) => sum + buy.usdReceived, 0)
const totalSoldUsd = (state: PersistedState) => state.sells.reduce((sum, sell) => sum + sell.usdSold, 0)

export const useTrackerState = () => {
  const [state, setState] = useState<PersistedState>(() => deriveState(normalizePersistedState(loadPersistedState(createEmptyState()))))
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null)

  useEffect(() => {
    persistState(state)
  }, [state])

  useEffect(() => {
    document.body.dataset.theme = state.settings.theme
  }, [state.settings.theme])

  useEffect(() => {
    if (!undoSnapshot) {
      return
    }

    const timeoutId = window.setTimeout(() => setUndoSnapshot(null), Math.max(0, undoSnapshot.expiresAt - Date.now()))
    return () => window.clearTimeout(timeoutId)
  }, [undoSnapshot])

  const saveBuy = (form: BuyFormState): ValidationResult => {
    if (!isPositiveNumber(form.buyRate) || !isPositiveNumber(form.lkrAmountPaid)) {
      return { ok: false, message: 'Buy rate and LKR amount must be greater than zero.' }
    }

    const transaction: BuyTransaction = {
      id: createId('buy'),
      accountId: state.activeAccountId,
      currency: form.currency ?? state.settings.defaultCurrency,
      dateTime: form.dateTime,
      buyRate: form.buyRate,
      lkrAmountPaid: form.lkrAmountPaid,
      bankCharges: form.bankCharges,
      additionalCharges: form.additionalCharges,
      notes: form.notes,
      tags: parseTags(form.tags),
      usdReceived: 0,
      totalCost: 0,
      effectiveBuyRate: 0,
    }

    setState((previous) => {
      const next = { ...previous, buys: [transaction, ...previous.buys] }
      return addBackupIfEnabled(previous, addAuditEntry(deriveState(next), 'Transaction Created', 'Buy', `Created buy ${transaction.id}`), `Buy ${transaction.id}`)
    })

    return { ok: true }
  }

  const saveSell = (form: SellFormState): ValidationResult => {
    if (!isPositiveNumber(form.sellRate) || !isPositiveNumber(form.usdSold)) {
      return { ok: false, message: 'Sell rate and USD sold must be greater than zero.' }
    }

    const availableUsd = getAvailableUsd(state.inventoryLots)
    if (form.usdSold > availableUsd + 1e-8) {
      return { ok: false, message: `Insufficient inventory. Available USD balance is ${availableUsd.toFixed(2)}.` }
    }

    const transaction: SellTransaction = {
      id: createId('sell'),
      accountId: state.activeAccountId,
      currency: form.currency ?? state.settings.defaultCurrency,
      dateTime: form.dateTime,
      sellRate: form.sellRate,
      usdSold: form.usdSold,
      bankCharges: form.bankCharges,
      additionalCharges: form.additionalCharges,
      notes: form.notes,
      tags: parseTags(form.tags),
      grossRevenue: 0,
      netRevenue: 0,
      buyCost: 0,
      profit: 0,
      profitPercent: 0,
      allocations: [],
    }

    setState((previous) => {
      const next = { ...previous, sells: [transaction, ...previous.sells] }
      return addBackupIfEnabled(previous, addAuditEntry(deriveState(next), 'Transaction Created', 'Sell', `Created sell ${transaction.id}`), `Sell ${transaction.id}`)
    })

    return { ok: true }
  }

  const updateBuyTransaction = (id: string, form: BuyFormState): ValidationResult => {
    if (!isPositiveNumber(form.buyRate) || !isPositiveNumber(form.lkrAmountPaid)) {
      return { ok: false, message: 'Buy rate and LKR amount must be greater than zero.' }
    }

    const existing = findBuy(state, id)
    if (!existing) {
      return { ok: false, message: 'Buy transaction not found.' }
    }

    const projectedUsdReceived = form.lkrAmountPaid / form.buyRate
    const projectedTotalBought = totalBoughtUsd(state) - existing.usdReceived + projectedUsdReceived
    if (projectedTotalBought + 1e-8 < totalSoldUsd(state)) {
      return { ok: false, message: 'This edit would make sold USD exceed available inventory.' }
    }

    setState((previous) => {
      const updatedBuy: BuyTransaction = {
        ...existing,
        dateTime: form.dateTime,
        buyRate: form.buyRate,
        lkrAmountPaid: form.lkrAmountPaid,
        bankCharges: form.bankCharges,
        additionalCharges: form.additionalCharges,
        notes: form.notes,
        tags: parseTags(form.tags),
        usdReceived: 0,
        totalCost: 0,
        effectiveBuyRate: 0,
      }

      const next = {
        ...previous,
        buys: previous.buys.map((buy) => (buy.id === id ? updatedBuy : buy)),
      }

      return addBackupIfEnabled(previous, addAuditEntry(deriveState(next), 'Transaction Edited', 'Buy', `Edited buy ${id}`), `Buy edit ${id}`)
    })

    return { ok: true }
  }

  const updateSellTransaction = (id: string, form: SellFormState): ValidationResult => {
    if (!isPositiveNumber(form.sellRate) || !isPositiveNumber(form.usdSold)) {
      return { ok: false, message: 'Sell rate and USD sold must be greater than zero.' }
    }

    const existing = findSell(state, id)
    if (!existing) {
      return { ok: false, message: 'Sell transaction not found.' }
    }

    const projectedTotalSold = totalSoldUsd(state) - existing.usdSold + form.usdSold
    if (projectedTotalSold > totalBoughtUsd(state) + 1e-8) {
      return { ok: false, message: 'This edit would exceed available buy inventory.' }
    }

    setState((previous) => {
      const updatedSell: SellTransaction = {
        ...existing,
        dateTime: form.dateTime,
        sellRate: form.sellRate,
        usdSold: form.usdSold,
        bankCharges: form.bankCharges,
        additionalCharges: form.additionalCharges,
        notes: form.notes,
        tags: parseTags(form.tags),
        grossRevenue: 0,
        netRevenue: 0,
        buyCost: 0,
        profit: 0,
        profitPercent: 0,
        allocations: [],
      }

      const next = {
        ...previous,
        sells: previous.sells.map((sell) => (sell.id === id ? updatedSell : sell)),
      }

      return addBackupIfEnabled(previous, addAuditEntry(deriveState(next), 'Transaction Edited', 'Sell', `Edited sell ${id}`), `Sell edit ${id}`)
    })

    return { ok: true }
  }

  const deleteBuyTransaction = (id: string): ValidationResult => {
    const existing = findBuy(state, id)
    if (!existing) {
      return { ok: false, message: 'Buy transaction not found.' }
    }

    if (totalBoughtUsd(state) - existing.usdReceived + 1e-8 < totalSoldUsd(state)) {
      return { ok: false, message: 'Deleting this buy would make sold USD exceed available inventory.' }
    }

    setUndoSnapshot({ state: cloneState(state), label: `Deleted buy ${id}`, expiresAt: Date.now() + 30_000 })
    setState((previous) => {
      const next = { ...previous, buys: previous.buys.filter((buy) => buy.id !== id) }
      return addBackupIfEnabled(previous, addAuditEntry(deriveState(next), 'Transaction Deleted', 'Buy', `Deleted buy ${id}`), `Buy delete ${id}`)
    })

    return { ok: true }
  }

  const deleteSellTransaction = (id: string): ValidationResult => {
    if (!findSell(state, id)) {
      return { ok: false, message: 'Sell transaction not found.' }
    }

    setUndoSnapshot({ state: cloneState(state), label: `Deleted sell ${id}`, expiresAt: Date.now() + 30_000 })
    setState((previous) => {
      const next = { ...previous, sells: previous.sells.filter((sell) => sell.id !== id) }
      return addBackupIfEnabled(previous, addAuditEntry(deriveState(next), 'Transaction Deleted', 'Sell', `Deleted sell ${id}`), `Sell delete ${id}`)
    })

    return { ok: true }
  }

  const deleteSelectedTransactions = (buyIds: string[], sellIds: string[]): ValidationResult => {
    if (buyIds.length === 0 && sellIds.length === 0) {
      return { ok: false, message: 'No transactions selected.' }
    }

    const deletedBuyUsd = state.buys.filter((buy) => buyIds.includes(buy.id)).reduce((sum, buy) => sum + buy.usdReceived, 0)
    const deletedSellUsd = state.sells.filter((sell) => sellIds.includes(sell.id)).reduce((sum, sell) => sum + sell.usdSold, 0)
    const projectedBought = totalBoughtUsd(state) - deletedBuyUsd
    const projectedSold = totalSoldUsd(state) - deletedSellUsd
    if (projectedSold > projectedBought + 1e-8) {
      return { ok: false, message: 'Selected deletes would leave more sold USD than available inventory.' }
    }

    setUndoSnapshot({ state: cloneState(state), label: 'Bulk delete', expiresAt: Date.now() + 30_000 })
    setState((previous) => {
      const next = {
        ...previous,
        buys: deleteIds(previous.buys, buyIds),
        sells: deleteIds(previous.sells, sellIds),
      }
      return addBackupIfEnabled(previous, addAuditEntry(deriveState(next), 'Bulk Delete', 'System', `Deleted ${buyIds.length} buys and ${sellIds.length} sells`), 'Bulk delete')
    })

    return { ok: true }
  }

  const deleteAllBuyTransactions = (): ValidationResult => deleteSelectedTransactions(state.buys.map((buy) => buy.id), [])
  const deleteAllSellTransactions = (): ValidationResult => deleteSelectedTransactions([], state.sells.map((sell) => sell.id))
  const deleteAllTransactions = (): ValidationResult => deleteSelectedTransactions(state.buys.map((buy) => buy.id), state.sells.map((sell) => sell.id))

  const undoLastDelete = (): ValidationResult => {
    if (!undoSnapshot) {
      return { ok: false, message: 'Nothing to undo.' }
    }

    if (undoSnapshot.expiresAt < Date.now()) {
      setUndoSnapshot(null)
      return { ok: false, message: 'Undo window expired.' }
    }

    setState(addAuditEntry(cloneState(undoSnapshot.state), 'Data Restored', 'System', `Undo: ${undoSnapshot.label}`))
    setUndoSnapshot(null)
    return { ok: true, message: 'Last deletion restored.' }
  }

  const importState = (incoming: PersistedState): ValidationResult => {
    if (!incoming || !Array.isArray(incoming.buys) || !Array.isArray(incoming.sells)) {
      return { ok: false, message: 'Invalid backup file.' }
    }

    setState(() => addAuditEntry(deriveState(cloneState(normalizePersistedState(incoming))), 'Data Imported', 'System', 'Imported JSON backup'))
    return { ok: true }
  }

  const restoreBackup = (backupId: string): ValidationResult => {
    const backup = state.backups.find((entry) => entry.id === backupId)
    if (!backup) {
      return { ok: false, message: 'Backup not found.' }
    }

    setState(() => addAuditEntry(deriveState(cloneState(normalizePersistedState(backup.state))), 'Data Restored', 'System', `Restored backup ${backupId}`))
    return { ok: true }
  }

  const setTheme = (theme: AppSettings['theme']) => setState((previous) => ({ ...previous, settings: { ...previous.settings, theme } }))
  const setCurrencyFormat = (currencyFormat: AppSettings['currencyFormat']) => setState((previous) => ({ ...previous, settings: { ...previous.settings, currencyFormat } }))
  const setAutoBackup = (autoBackup: boolean) => setState((previous) => ({ ...previous, settings: { ...previous.settings, autoBackup } }))
  const setProfitPrecision = (profitPrecision: number) => setState((previous) => ({ ...previous, settings: { ...previous.settings, profitPrecision } }))
  const setBackupEncryption = (encryptBackups: boolean) => setState((previous) => ({ ...previous, settings: { ...previous.settings, encryptBackups } }))
  const setDefaultCurrency = (defaultCurrency: SupportedCurrency) => setState((previous) => ({ ...previous, settings: { ...previous.settings, defaultCurrency } }))
  const setDefaultTheme = (defaultTheme: AppSettings['theme']) => setState((previous) => ({ ...previous, settings: { ...previous.settings, defaultTheme } }))
  const setExportPreference = (exportPreference: AppSettings['exportPreference']) => setState((previous) => ({ ...previous, settings: { ...previous.settings, exportPreference } }))
  const setBackupPreference = (backupPreference: AppSettings['backupPreference']) => setState((previous) => ({ ...previous, settings: { ...previous.settings, backupPreference } }))
  const setActiveAccount = (accountId: string) => setState((previous) => ({ ...previous, activeAccountId: accountId }))

  const createAccount = (name: string, description: string) => {
    const account: Account = {
      id: createId('account'),
      name,
      description,
      isArchived: false,
      createdAt: new Date().toISOString(),
    }

    setState((previous) => ({
      ...previous,
      accounts: [account, ...previous.accounts],
      activeAccountId: account.id,
    }))
  }

  const archiveCurrentAccountTransactions = () => {
    setState((previous) => ({
      ...previous,
      archive: {
        buys: [...previous.archive.buys, ...previous.buys.filter((buy) => buy.accountId === previous.activeAccountId)],
        sells: [...previous.archive.sells, ...previous.sells.filter((sell) => sell.accountId === previous.activeAccountId)],
      },
      buys: previous.buys.filter((buy) => buy.accountId !== previous.activeAccountId),
      sells: previous.sells.filter((sell) => sell.accountId !== previous.activeAccountId),
      notifications: [
        {
          id: createId('notification'),
          type: 'info',
          title: 'Archive completed',
          message: 'Active account transactions were moved to archive.',
          createdAt: new Date().toISOString(),
          read: false,
        },
        ...previous.notifications,
      ],
    }))
  }

  const restoreArchive = () => {
    setState((previous) => ({
      ...previous,
      buys: [...previous.buys, ...previous.archive.buys],
      sells: [...previous.sells, ...previous.archive.sells],
      archive: { buys: [], sells: [] },
    }))
  }

  const clearArchive = () => {
    setState((previous) => ({ ...previous, archive: { buys: [], sells: [] } }))
  }

  const saveGoal = (goal: Goal) => {
    setState((previous) => {
      const next = { ...previous, goals: [goal, ...previous.goals] }
      if (goal.currentAmount >= goal.targetAmount) {
        return {
          ...next,
          notifications: [
            {
              id: createId('notification'),
              type: 'goal-achieved',
              title: `${goal.name} achieved`,
              message: `Goal target of ${goal.targetAmount} has been reached.`,
              createdAt: new Date().toISOString(),
              read: false,
            },
            ...next.notifications,
          ],
        }
      }

      return next
    })
  }

  const saveFilter = (filter: SavedFilter) => {
    setState((previous) => ({ ...previous, savedFilters: [filter, ...previous.savedFilters] }))
  }

  const addNotification = (notification: NotificationItem) => {
    setState((previous) => ({ ...previous, notifications: [notification, ...previous.notifications].slice(0, 100) }))
  }

  const updateCloudSync = (cloudSync: CloudSyncConfig) => setState((previous) => ({ ...previous, cloudSync }))

  const logExport = (details: string) =>
    setState((previous) => addAuditEntry(previous, 'Data Exported', 'System', details))

  const createManualBackup = (label: string) => {
    setState((previous) => {
      const snapshot: BackupSnapshot = { id: createId('backup'), createdAt: new Date().toISOString(), label, state: cloneState(previous) }
      return { ...previous, backups: [snapshot, ...previous.backups].slice(0, 20) }
    })
  }

  const resetAnalytics = () =>
    setState((previous) => {
      const next = { ...previous, auditLog: [] }
      return addAuditEntry(next, 'Data Cleared', 'System', 'Reset analytics history')
    })

  const clearAllData = () => {
    clearPersistedState()
    setState(addAuditEntry(createEmptyState(), 'Data Cleared', 'System', 'Cleared all application data'))
  }

  const statistics = useMemo(() => {
    const availableUsd = getAvailableUsd(state.inventoryLots)
    const totalBuyCost = state.inventoryLots.reduce((sum, lot) => sum + lot.costBasis, 0)
    const averageBuyRate = availableUsd > 0 ? totalBuyCost / availableUsd : 0
    const totalTransactions = state.buys.length + state.sells.length
    const recentBuys = state.buys.filter((buy) => new Date(buy.dateTime) >= startOfDay(addDays(new Date(), -30)))

    return { availableUsd, totalBuyCost, averageBuyRate, totalTransactions, recentBuys }
  }, [state.buys, state.inventoryLots, state.sells])

  return {
    state,
    statistics,
    undoSnapshot,
    actions: {
      saveBuy,
      saveSell,
      updateBuyTransaction,
      updateSellTransaction,
      deleteBuyTransaction,
      deleteSellTransaction,
      deleteSelectedTransactions,
      deleteAllBuyTransactions,
      deleteAllSellTransactions,
      deleteAllTransactions,
      undoLastDelete,
      setTheme,
      setCurrencyFormat,
      setAutoBackup,
      setProfitPrecision,
      setBackupEncryption,
      setDefaultCurrency,
      setDefaultTheme,
      setExportPreference,
      setBackupPreference,
      setActiveAccount,
      createAccount,
      archiveCurrentAccountTransactions,
      restoreArchive,
      clearArchive,
      saveGoal,
      saveFilter,
      addNotification,
      updateCloudSync,
      createManualBackup,
      logExport,
      importState,
      restoreBackup,
      resetAnalytics,
      clearAllData,
    },
  }
}

import type { PersistedState } from '../types'

const STORAGE_KEY = 'binance-p2p-profit-tracker-state-v1'

export const loadPersistedState = (fallback: PersistedState): PersistedState => {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback

    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      ...fallback,
      ...parsed,
      settings: {
        ...fallback.settings,
        ...parsed.settings,
      },
      buys: Array.isArray(parsed.buys) ? parsed.buys : fallback.buys,
      sells: Array.isArray(parsed.sells) ? parsed.sells : fallback.sells,
      inventoryLots: Array.isArray(parsed.inventoryLots) ? parsed.inventoryLots : fallback.inventoryLots,
      archive: parsed.archive && typeof parsed.archive === 'object' ? parsed.archive : fallback.archive,
      backups: Array.isArray(parsed.backups) ? parsed.backups : fallback.backups,
      auditLog: Array.isArray((parsed as PersistedState).auditLog) ? (parsed as PersistedState).auditLog : fallback.auditLog,
      accounts: Array.isArray((parsed as PersistedState).accounts) ? (parsed as PersistedState).accounts : fallback.accounts,
      goals: Array.isArray((parsed as PersistedState).goals) ? (parsed as PersistedState).goals : fallback.goals,
      savedFilters: Array.isArray((parsed as PersistedState).savedFilters) ? (parsed as PersistedState).savedFilters : fallback.savedFilters,
      notifications: Array.isArray((parsed as PersistedState).notifications) ? (parsed as PersistedState).notifications : fallback.notifications,
      activeAccountId: typeof (parsed as PersistedState).activeAccountId === 'string' ? (parsed as PersistedState).activeAccountId : fallback.activeAccountId,
      cloudSync: typeof (parsed as PersistedState).cloudSync === 'object' ? (parsed as PersistedState).cloudSync : fallback.cloudSync,
    }
  } catch {
    return fallback
  }
}

export const persistState = (state: PersistedState) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const clearPersistedState = () => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(STORAGE_KEY)
}

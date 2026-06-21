export type PageKey = 'dashboard' | 'buy' | 'sell' | 'inventory' | 'analytics' | 'history' | 'activity-log' | 'archive' | 'reports' | 'settings' | 'accounts' | 'goals' | 'forecasting' | 'advanced-analytics'

export type ThemeMode = 'dark' | 'light'
export type CurrencyFormat = 'standard' | 'compact'
export type SupportedCurrency = 'USD' | 'EUR' | 'GBP' | 'AED' | 'USDT'

export interface Account {
  id: string
  name: string
  description: string
  isArchived: boolean
  createdAt: string
}

export interface Goal {
  id: string
  name: string
  type: 'monthly-profit' | 'annual-profit' | 'revenue'
  targetAmount: number
  currentAmount: number
  startDate: string
  targetDate: string
  accountId: string
  currency: SupportedCurrency
}

export interface SavedFilter {
  id: string
  name: string
  query: string
  createdAt: string
}

export interface NotificationItem {
  id: string
  type: 'goal-achieved' | 'monthly-target' | 'backup-reminder' | 'info'
  title: string
  message: string
  createdAt: string
  read: boolean
}

export interface ArchivedTransactionGroup {
  buys: BuyTransaction[]
  sells: SellTransaction[]
}

export interface CloudSyncConfig {
  provider: 'local' | 'firebase' | 'supabase' | 'postgres' | 'github-gist'
  enabled: boolean
  endpoint?: string
  firebaseConfig?: FirebaseConfig
  gistId?: string
  accessToken?: string
  fileName?: string
  lastSyncedAt?: string
  lastSyncMessage?: string
  lastSyncError?: string
}

export interface FirebaseConfig {
  apiKey?: string
  authDomain?: string
  projectId?: string
  appId?: string
  databaseURL?: string
}

export interface BuyTransaction {
  id: string
  accountId: string
  currency: SupportedCurrency
  dateTime: string
  buyRate: number
  lkrAmountPaid: number
  bankCharges: number
  additionalCharges: number
  notes: string
  tags: string[]
  usdReceived: number
  totalCost: number
  effectiveBuyRate: number
}

export interface SellAllocation {
  buyId: string
  usd: number
  cost: number
}

export interface SellTransaction {
  id: string
  accountId: string
  currency: SupportedCurrency
  dateTime: string
  sellRate: number
  usdSold: number
  bankCharges: number
  additionalCharges: number
  notes: string
  tags: string[]
  grossRevenue: number
  netRevenue: number
  buyCost: number
  profit: number
  profitPercent: number
  allocations: SellAllocation[]
}

export interface InventoryLot {
  id: string
  buyId: string
  accountId: string
  currency: SupportedCurrency
  dateTime: string
  buyRate: number
  remainingUsd: number
  costBasis: number
  costPerUsd: number
}

export interface BackupSnapshot {
  id: string
  createdAt: string
  label: string
  state: PersistedState
}

export interface AppSettings {
  theme: ThemeMode
  currencyFormat: CurrencyFormat
  autoBackup: boolean
  profitPrecision: number
  encryptBackups: boolean
  defaultCurrency: SupportedCurrency
  defaultTheme: ThemeMode
  exportPreference: 'pdf' | 'xlsx' | 'csv' | 'json'
  backupPreference: 'auto' | 'manual'
}

export interface PersistedState {
  accounts: Account[]
  activeAccountId: string
  buys: BuyTransaction[]
  sells: SellTransaction[]
  inventoryLots: InventoryLot[]
  archive: ArchivedTransactionGroup
  backups: BackupSnapshot[]
  auditLog: AuditLogEntry[]
  goals: Goal[]
  savedFilters: SavedFilter[]
  notifications: NotificationItem[]
  cloudSync: CloudSyncConfig
  settings: AppSettings
}

export type AuditAction =
  | 'Transaction Created'
  | 'Transaction Edited'
  | 'Transaction Deleted'
  | 'Data Imported'
  | 'Data Exported'
  | 'Data Restored'
  | 'Data Cleared'
  | 'Bulk Delete'

export interface AuditLogEntry {
  id: string
  action: AuditAction
  dateTime: string
  transactionType: 'Buy' | 'Sell' | 'System'
  details: string
}

export interface TransactionFormBase {
  dateTime: string
  bankCharges: number
  additionalCharges: number
  notes: string
  tags: string
}

export interface BuyFormState extends TransactionFormBase {
  buyRate: number
  lkrAmountPaid: number
  currency: SupportedCurrency
}

export interface SellFormState extends TransactionFormBase {
  sellRate: number
  usdSold: number
  currency: SupportedCurrency
}

export interface DateRange {
  start: string
  end: string
}

export interface ValidationResult {
  ok: boolean
  message?: string
}

export interface UndoSnapshot {
  state: PersistedState
  label: string
  expiresAt: number
}

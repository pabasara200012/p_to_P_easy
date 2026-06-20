import type { BuyTransaction, PersistedState, SavedFilter, SellTransaction } from '../types'

export interface TradeSearchFilter {
  query: string
  minProfit?: number
  maxProfit?: number
  minRevenue?: number
  maxRevenue?: number
  currency?: string
  accountId?: string
  tags?: string[]
  notes?: string
}

export const parseTradeSearchQuery = (query: string): TradeSearchFilter => {
  const filter: TradeSearchFilter = { query }
  query.split(/\s+/).forEach((token) => {
    if (token.startsWith('profit>')) filter.minProfit = Number(token.slice(7))
    if (token.startsWith('profit<')) filter.maxProfit = Number(token.slice(7))
    if (token.startsWith('revenue>')) filter.minRevenue = Number(token.slice(8))
    if (token.startsWith('revenue<')) filter.maxRevenue = Number(token.slice(8))
    if (token.startsWith('currency:')) filter.currency = token.slice(9).toUpperCase()
    if (token.startsWith('account:')) filter.accountId = token.slice(8)
    if (token.startsWith('tag:')) filter.tags = [...(filter.tags ?? []), token.slice(4)]
    if (token.startsWith('notes:')) filter.notes = token.slice(6)
  })
  return filter
}

export const applyTradeSearch = (state: PersistedState, filter: TradeSearchFilter) => {
  const term = filter.query.trim().toLowerCase()
  const buyMatches = state.buys.filter((buy) => matchesBuy(buy, filter, term))
  const sellMatches = state.sells.filter((sell) => matchesSell(sell, filter, term))
  return { buys: buyMatches, sells: sellMatches }
}

const matchesBuy = (buy: BuyTransaction, filter: TradeSearchFilter, term: string) => {
  if (filter.accountId && buy.accountId !== filter.accountId) return false
  if (filter.currency && buy.currency !== filter.currency) return false
  if (term && ![buy.notes, buy.tags.join(' '), buy.buyRate, buy.lkrAmountPaid, buy.usdReceived].join(' ').toLowerCase().includes(term)) return false
  if (filter.tags?.length && !filter.tags.every((tag) => buy.tags.includes(tag))) return false
  if (filter.notes && !buy.notes.toLowerCase().includes(filter.notes.toLowerCase())) return false
  return true
}

const matchesSell = (sell: SellTransaction, filter: TradeSearchFilter, term: string) => {
  if (filter.accountId && sell.accountId !== filter.accountId) return false
  if (filter.currency && sell.currency !== filter.currency) return false
  if (filter.minProfit !== undefined && sell.profit < filter.minProfit) return false
  if (filter.maxProfit !== undefined && sell.profit > filter.maxProfit) return false
  if (filter.minRevenue !== undefined && sell.netRevenue < filter.minRevenue) return false
  if (filter.maxRevenue !== undefined && sell.netRevenue > filter.maxRevenue) return false
  if (term && ![sell.notes, sell.tags.join(' '), sell.sellRate, sell.usdSold, sell.profit].join(' ').toLowerCase().includes(term)) return false
  if (filter.tags?.length && !filter.tags.every((tag) => sell.tags.includes(tag))) return false
  if (filter.notes && !sell.notes.toLowerCase().includes(filter.notes.toLowerCase())) return false
  return true
}

export const saveFilterDefinition = (filters: SavedFilter[], nextFilter: SavedFilter) => [nextFilter, ...filters]

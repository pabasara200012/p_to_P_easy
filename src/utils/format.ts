import { format } from 'date-fns'

export const formatNumber = (value: number, digits = 2) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0)

export const formatCurrency = (value: number, formatMode: 'standard' | 'compact', digits = 2) => {
  if (formatMode === 'compact') {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      minimumFractionDigits: Math.max(0, digits),
      maximumFractionDigits: Math.max(0, digits),
    }).format(Number.isFinite(value) ? value : 0)
  }

  return formatNumber(value, digits)
}

export const formatMoney = (value: number, formatMode: 'standard' | 'compact', digits = 2) =>
  `LKR ${formatCurrency(value, formatMode, digits)}`

export const formatUsd = (value: number, formatMode: 'standard' | 'compact') => `$${formatCurrency(value, formatMode)}`

export const formatPercent = (value: number) => `${formatNumber(value, 2)}%`

export const toInputDateTime = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(value) : value
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export const safeDate = (value: string) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export const friendlyDateTime = (value: string) => format(safeDate(value), 'PPP p')

export const friendlyDate = (value: string) => format(safeDate(value), 'PP')

import * as XLSX from 'xlsx'
import type { BuyTransaction, SellTransaction } from '../types'

export const buildDailyReport = (buys: BuyTransaction[], sells: SellTransaction[]) => ({ label: 'Daily Report', summary: { buys: buys.length, sells: sells.length, profit: sells.reduce((sum, sell) => sum + sell.profit, 0) } })
export const buildWeeklyReport = (buys: BuyTransaction[], sells: SellTransaction[]) => ({ label: 'Weekly Report', summary: { buys: buys.length, sells: sells.length, profit: sells.reduce((sum, sell) => sum + sell.profit, 0) } })
export const buildMonthlyReport = (buys: BuyTransaction[], sells: SellTransaction[]) => ({ label: 'Monthly Report', summary: { buys: buys.length, sells: sells.length, profit: sells.reduce((sum, sell) => sum + sell.profit, 0) } })
export const buildOverallReport = (buys: BuyTransaction[], sells: SellTransaction[]) => ({ label: 'Overall Report', summary: { buys: buys.length, sells: sells.length, profit: sells.reduce((sum, sell) => sum + sell.profit, 0) } })

export const toCsv = (rows: Record<string, string | number | boolean | null | undefined>[]) => {
  if (rows.length === 0) {
    return ''
  }

  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  rows.forEach((row) => {
    const values = headers.map((header) => `"${String(row[header] ?? '').replaceAll('"', '""')}"`)
    lines.push(values.join(','))
  })
  return lines.join('\n')
}

export const toJson = (data: unknown) => JSON.stringify(data, null, 2)

export const toWorkbook = (rows: Record<string, string | number | boolean | null | undefined>[]) => {
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report')
  return workbook
}

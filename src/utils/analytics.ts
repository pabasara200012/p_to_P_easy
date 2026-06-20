import { eachDayOfInterval, endOfDay, endOfMonth, endOfToday, format, startOfDay, startOfMonth, subDays, subMonths } from 'date-fns'
import type { BuyTransaction, InventoryLot, SellTransaction } from '../types'
import { getAvailableUsd } from './fifo'

export interface PeriodSummary {
  sales: number
  revenue: number
  cost: number
  profit: number
  count: number
}

export interface DashboardAnalytics {
  today: PeriodSummary
  last7Days: PeriodSummary
  last30Days: PeriodSummary
  currentMonth: PeriodSummary
  overall: {
    totalUsdBought: number
    totalUsdSold: number
    remainingUsdBalance: number
    totalInvestment: number
    totalRevenue: number
    totalProfit: number
    roiPercentage: number
    averageBuyRate: number
    averageSellRate: number
    profitPerUsd: number
    averageProfitPerTrade: number
    winRate: number
    averageTradeSize: number
    totalFeesPaid: number
    totalTransactionCount: number
    lifetimeProfit: number
    monthlyGrowthPercentage: number
    forecastNextMonthProfit: number
    currentUsdInventoryValue: number
    unrealizedProfit: number
    realizedProfit: number
    bestTrade: SellTransaction | null
    worstTrade: SellTransaction | null
    bestPerformingDay: { date: string; profit: number } | null
    bestPerformingMonth: { month: string; profit: number } | null
    monthlyLeaderboard: Array<{ month: string; profit: number }>
  }
}

export interface AnalyticsBundle {
  dashboard: DashboardAnalytics
  dailyProfitSeries: Array<{ date: string; profit: number }>
  weeklyProfitSeries: Array<{ week: string; profit: number }>
  monthlyProfitSeries: Array<{ month: string; profit: number }>
  yearlyProfitSeries: Array<{ year: string; profit: number }>
  revenueVsCostSeries: Array<{ label: string; revenue: number; cost: number }>
  usdBalanceSeries: Array<{ date: string; balance: number }>
  buyRateSeries: Array<{ date: string; rate: number }>
  sellRateSeries: Array<{ date: string; rate: number }>
}

const zeroSummary = (): PeriodSummary => ({ sales: 0, revenue: 0, cost: 0, profit: 0, count: 0 })

const summarizeSells = (sells: SellTransaction[], start: Date, end: Date): PeriodSummary =>
  sells.reduce((summary, sell) => {
    const timestamp = new Date(sell.dateTime).getTime()
    if (timestamp < start.getTime() || timestamp > end.getTime()) {
      return summary
    }

    summary.sales += sell.netRevenue
    summary.revenue += sell.netRevenue
    summary.cost += sell.buyCost + sell.bankCharges + sell.additionalCharges
    summary.profit += sell.profit
    summary.count += 1
    return summary
  }, zeroSummary())

const summarizeAllSells = (sells: SellTransaction[]): PeriodSummary =>
  sells.reduce((summary, sell) => {
    summary.sales += sell.netRevenue
    summary.revenue += sell.netRevenue
    summary.cost += sell.buyCost + sell.bankCharges + sell.additionalCharges
    summary.profit += sell.profit
    summary.count += 1
    return summary
  }, zeroSummary())

const buildDailyMap = (sells: SellTransaction[]) => {
  const map = new Map<string, { revenue: number; cost: number; profit: number; buyRate: number[]; sellRate: number[] }>()

  sells.forEach((sell) => {
    const key = format(startOfDay(new Date(sell.dateTime)), 'yyyy-MM-dd')
    const entry = map.get(key) ?? { revenue: 0, cost: 0, profit: 0, buyRate: [], sellRate: [] }
    entry.revenue += sell.netRevenue
    entry.cost += sell.buyCost + sell.bankCharges + sell.additionalCharges
    entry.profit += sell.profit
    entry.sellRate.push(sell.sellRate)
    map.set(key, entry)
  })

  return map
}

const buildWeeklyMap = (sells: SellTransaction[]) => {
  const map = new Map<string, number>()
  sells.forEach((sell) => {
    const start = startOfDay(new Date(sell.dateTime))
    const weekKey = format(start, 'RRRR-II')
    map.set(weekKey, (map.get(weekKey) ?? 0) + sell.profit)
  })
  return map
}

const buildBuyRateMap = (buys: BuyTransaction[]) => {
  const map = new Map<string, number[]>()
  buys.forEach((buy) => {
    const key = format(startOfDay(new Date(buy.dateTime)), 'yyyy-MM-dd')
    const entry = map.get(key) ?? []
    entry.push(buy.buyRate)
    map.set(key, entry)
  })
  return map
}

export const buildAnalytics = (buys: BuyTransaction[], sells: SellTransaction[], lots: InventoryLot[]): AnalyticsBundle => {
  const todayStart = startOfDay(new Date())
  const todayEnd = endOfDay(endOfToday())
  const last7Start = startOfDay(subDays(new Date(), 6))
  const last30Start = startOfDay(subDays(new Date(), 29))
  const currentMonthStart = startOfMonth(new Date())
  const currentMonthEnd = endOfMonth(new Date())

  const today = summarizeSells(sells, todayStart, todayEnd)
  const last7Days = summarizeSells(sells, last7Start, todayEnd)
  const last30Days = summarizeSells(sells, last30Start, todayEnd)
  const currentMonth = summarizeSells(sells, currentMonthStart, currentMonthEnd)
  const overall = summarizeAllSells(sells)
  const totalUsdBought = buys.reduce((sum, buy) => sum + buy.usdReceived, 0)
  const totalUsdSold = sells.reduce((sum, sell) => sum + sell.usdSold, 0)
  const remainingUsdBalance = getAvailableUsd(lots)
  const totalInvestment = buys.reduce((sum, buy) => sum + buy.totalCost, 0)
  const totalRevenue = overall.revenue
  const totalProfit = overall.profit
  const totalFeesPaid = buys.reduce((sum, buy) => sum + buy.bankCharges + buy.additionalCharges, 0) + sells.reduce((sum, sell) => sum + sell.bankCharges + sell.additionalCharges, 0)
  const roiPercentage = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0
  const averageBuyRate = totalUsdBought > 0 ? totalInvestment / totalUsdBought : 0
  const averageSellRate = totalUsdSold > 0 ? totalRevenue / totalUsdSold : 0
  const profitPerUsd = totalUsdSold > 0 ? totalProfit / totalUsdSold : 0
  const averageProfitPerTrade = sells.length > 0 ? totalProfit / sells.length : 0
  const winRate = sells.length > 0 ? (sells.filter((sell) => sell.profit > 0).length / sells.length) * 100 : 0
  const averageTradeSize = sells.length > 0 ? sells.reduce((sum, sell) => sum + sell.usdSold, 0) / sells.length : 0
  const totalTransactionCount = buys.length + sells.length
  const lifetimeProfit = totalProfit
  const previousMonthRangeStart = startOfMonth(subMonths(new Date(), 1))
  const previousMonthRangeEnd = endOfMonth(subMonths(new Date(), 1))
  const previousMonthProfit = summarizeSells(sells, previousMonthRangeStart, previousMonthRangeEnd).profit
  const monthlyGrowthPercentage = previousMonthProfit !== 0 ? ((currentMonth.profit - previousMonthProfit) / Math.abs(previousMonthProfit)) * 100 : 0
  const forecastNextMonthProfit = last30Days.profit > 0 ? last30Days.profit : 0
  const bestTrade = sells.length > 0 ? [...sells].sort((left, right) => right.profit - left.profit)[0] : null
  const worstTrade = sells.length > 0 ? [...sells].sort((left, right) => left.profit - right.profit)[0] : null
  const dailyMap = buildDailyMap(sells)

  const monthProfitMap = new Map<string, number>()
  sells.forEach((sell) => {
    const month = format(new Date(sell.dateTime), 'yyyy-MM')
    monthProfitMap.set(month, (monthProfitMap.get(month) ?? 0) + sell.profit)
  })

  const monthlyLeaderboard = [...monthProfitMap.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6).map(([month, profit]) => ({ month, profit }))
  const bestPerformingDayEntry = [...dailyMap.entries()].sort((left, right) => right[1].profit - left[1].profit)[0]
  const bestPerformingMonthEntry = [...monthProfitMap.entries()].sort((left, right) => right[1] - left[1])[0]
  const currentUsdInventoryValue = remainingUsdBalance * (averageSellRate || averageBuyRate)
  const unrealizedProfit = currentUsdInventoryValue - (remainingUsdBalance > 0 ? buys.reduce((sum, buy) => sum + buy.totalCost, 0) * (remainingUsdBalance / Math.max(1, totalUsdBought)) : 0)
  const realizedProfit = totalProfit

  const dashboard: DashboardAnalytics = {
    today,
    last7Days,
    last30Days,
    currentMonth,
    overall: {
      totalUsdBought,
      totalUsdSold,
      remainingUsdBalance,
      totalInvestment,
      totalRevenue,
      totalProfit,
      roiPercentage,
      averageBuyRate,
      averageSellRate,
      profitPerUsd,
      averageProfitPerTrade,
      winRate,
      averageTradeSize,
      totalFeesPaid,
      totalTransactionCount,
      lifetimeProfit,
      monthlyGrowthPercentage,
      forecastNextMonthProfit,
      currentUsdInventoryValue,
      unrealizedProfit,
      realizedProfit,
      bestTrade,
      worstTrade,
      bestPerformingDay: bestPerformingDayEntry ? { date: bestPerformingDayEntry[0], profit: bestPerformingDayEntry[1].profit } : null,
      bestPerformingMonth: bestPerformingMonthEntry ? { month: bestPerformingMonthEntry[0], profit: bestPerformingMonthEntry[1] } : null,
      monthlyLeaderboard,
    },
  }

  const buyRateMap = buildBuyRateMap(buys)

  const dailyProfitSeries = eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() }).map((day) => {
    const key = format(day, 'yyyy-MM-dd')
    const entry = dailyMap.get(key)
    return { date: key, profit: entry?.profit ?? 0 }
  })

  const weeklyProfitMap = buildWeeklyMap(sells)
  const weeklyProfitSeries = [...weeklyProfitMap.entries()].sort((left, right) => left[0].localeCompare(right[0])).map(([week, profit]) => ({ week, profit }))

  const monthlyProfitSeries = [...monthProfitMap.entries()].sort((left, right) => left[0].localeCompare(right[0])).map(([month, profit]) => ({ month, profit }))

  const yearlyProfitMap = new Map<string, number>()
  sells.forEach((sell) => {
    const year = format(new Date(sell.dateTime), 'yyyy')
    yearlyProfitMap.set(year, (yearlyProfitMap.get(year) ?? 0) + sell.profit)
  })
  const yearlyProfitSeries = [...yearlyProfitMap.entries()].sort((left, right) => left[0].localeCompare(right[0])).map(([year, profit]) => ({ year, profit }))

  const revenueVsCostSeries = dailyProfitSeries.map((day) => {
    const entry = dailyMap.get(day.date)
    return { label: day.date, revenue: entry?.revenue ?? 0, cost: entry?.cost ?? 0 }
  })

  const usdBalanceSeries = dailyProfitSeries.map((day, index) => ({
    date: day.date,
    balance: Math.max(0, totalUsdBought - (index / Math.max(1, dailyProfitSeries.length)) * totalUsdSold),
  }))

  const buyRateSeries = dailyProfitSeries.map((day) => {
    const rates = buyRateMap.get(day.date) ?? []
    return { date: day.date, rate: rates.length > 0 ? rates.reduce((sum, value) => sum + value, 0) / rates.length : 0 }
  })

  const sellRateSeries = dailyProfitSeries.map((day) => {
    const entry = dailyMap.get(day.date)
    return { date: day.date, rate: entry && entry.sellRate.length > 0 ? entry.sellRate.reduce((sum, value) => sum + value, 0) / entry.sellRate.length : 0 }
  })

  return {
    dashboard,
    dailyProfitSeries,
    weeklyProfitSeries,
    monthlyProfitSeries,
    yearlyProfitSeries,
    revenueVsCostSeries,
    usdBalanceSeries,
    buyRateSeries,
    sellRateSeries,
  }
}

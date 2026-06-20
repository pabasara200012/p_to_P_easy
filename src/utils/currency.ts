import type { SupportedCurrency } from '../types'

const EXCHANGE_RATE_TO_USD: Record<SupportedCurrency, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  AED: 0.27,
  USDT: 1,
}

export const convertCurrency = (amount: number, from: SupportedCurrency, to: SupportedCurrency) => {
  const usdValue = amount * EXCHANGE_RATE_TO_USD[from]
  return usdValue / EXCHANGE_RATE_TO_USD[to]
}

export const getCurrencyOptions = (): SupportedCurrency[] => ['USD', 'EUR', 'GBP', 'AED', 'USDT']

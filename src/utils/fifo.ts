import type { BuyTransaction, InventoryLot, SellAllocation } from '../types'
import { createId } from './ids'

export interface SellAllocationResult {
  inventoryLots: InventoryLot[]
  allocations: SellAllocation[]
  buyCost: number
}

export const buildInventoryLot = (buy: BuyTransaction): InventoryLot => ({
  id: createId('lot'),
  buyId: buy.id,
  accountId: buy.accountId,
  currency: buy.currency,
  dateTime: buy.dateTime,
  buyRate: buy.buyRate,
  remainingUsd: buy.usdReceived,
  costBasis: buy.totalCost,
  costPerUsd: buy.effectiveBuyRate,
})

export const getAvailableUsd = (lots: InventoryLot[]) => lots.reduce((total, lot) => total + lot.remainingUsd, 0)

export const filterLotsByContext = (lots: InventoryLot[], accountId: string, currency: string) =>
  lots.filter((lot) => lot.accountId === accountId && lot.currency === currency)

export const applyFifoSell = (lots: InventoryLot[], usdSold: number): SellAllocationResult => {
  const orderedLots = [...lots].sort((left, right) => new Date(left.dateTime).getTime() - new Date(right.dateTime).getTime())

  let remainingToAllocate = usdSold
  let buyCost = 0
  const allocations: SellAllocation[] = []

  const inventoryLots = orderedLots.map((lot) => ({ ...lot }))

  for (const lot of inventoryLots) {
    if (remainingToAllocate <= 0) {
      break
    }

    const usedUsd = Math.min(lot.remainingUsd, remainingToAllocate)
    const cost = usedUsd * lot.costPerUsd
    lot.remainingUsd -= usedUsd
    remainingToAllocate -= usedUsd
    buyCost += cost
    allocations.push({ buyId: lot.buyId, usd: usedUsd, cost })
  }

  return { inventoryLots, allocations, buyCost }
}

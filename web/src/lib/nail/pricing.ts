export const PRICES = {
  '1k': { regular: 10, vip: 5 },
  '4k': { regular: 30, vip: 15 },
} as const

export function generationPrice(size: keyof typeof PRICES, isVip: boolean): number {
  return PRICES[size][isVip ? 'vip' : 'regular']
}

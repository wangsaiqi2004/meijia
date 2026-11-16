"use client"

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  PRICE_KEYS,
  validatePriceTable,
  type PriceTable,
  type PricingConfig,
  type Size,
} from '@/lib/nail/contracts'

export type SystemSettingsProps = {
  config: PricingConfig
  busy: boolean
  onAction: (body: Record<string, unknown>, success: string) => Promise<void>
}

type PriceForm = Record<Size, { regular: string; vip: string }>

const SIZE_LABEL: Record<Size, string> = { '1k': '1K 标准', '4k': '4K 高清' }
const TIER_LABEL = { regular: '普通', vip: 'VIP' } as const
const PRICE_SOURCE_LABEL = { database: '后台设置', default: '系统默认' } as const

function toForm(prices: PriceTable): PriceForm {
  return {
    '1k': { regular: String(prices['1k'].regular), vip: String(prices['1k'].vip) },
    '4k': { regular: String(prices['4k'].regular), vip: String(prices['4k'].vip) },
  }
}

const cardClass = 'rounded-lg border border-[var(--app-border)] bg-white p-4 sm:p-5'
const inputClass = 'h-10 w-full rounded-md border border-[var(--app-border)] bg-white px-3 text-xs text-[var(--app-ink)]'
const primaryButton = 'flex h-10 items-center justify-center rounded-md bg-[#173b32] px-4 text-xs font-medium text-white disabled:opacity-50'
const secondaryButton = 'flex h-10 items-center justify-center rounded-md border border-[var(--app-border)] bg-white px-4 text-xs font-medium text-[var(--app-secondary)] disabled:opacity-50'

/** 管理后台「系统设置」：生图价格。 */
export function SystemSettings({ config, busy, onAction }: SystemSettingsProps) {
  const [priceForm, setPriceForm] = useState<PriceForm>(() => toForm(config.prices))

  // 保存成功后父组件会重新拉 GET，配置变化即把表单对齐到服务端值。
  useEffect(() => { setPriceForm(toForm(config.prices)) }, [config.prices])

  function updatePrice(size: Size, tier: 'regular' | 'vip', value: string) {
    setPriceForm(current => ({ ...current, [size]: { ...current[size], [tier]: value } }))
  }

  async function savePrices() {
    const prices: PriceTable = {
      '1k': { regular: Number(priceForm['1k'].regular), vip: Number(priceForm['1k'].vip) },
      '4k': { regular: Number(priceForm['4k'].regular), vip: Number(priceForm['4k'].vip) },
    }
    const checked = validatePriceTable(prices)
    if (!checked.ok) { toast.error(checked.message); return }
    if (checked.prices['1k'].vip > checked.prices['1k'].regular ||
        checked.prices['4k'].vip > checked.prices['4k'].regular) {
      toast('VIP 价高于普通价，请确认')
    }
    const changes: string[] = []
    for (const size of PRICE_KEYS) {
      for (const tier of ['regular', 'vip'] as const) {
        const before = config.prices[size][tier]
        const after = checked.prices[size][tier]
        if (before !== after) changes.push(`${SIZE_LABEL[size]} ${TIER_LABEL[tier]}：${before} → ${after} 点/次`)
      }
    }
    if (!changes.length) { toast('价格没有变化'); return }
    if (!window.confirm(`确认修改生图价格？\n${changes.join('\n')}`)) return
    // 失败时保留输入，方便修正后重试；成功由 config.prices 变化重置表单。
    await onAction({ action: 'save-prices', prices: checked.prices }, '价格已更新，下一次生成起生效').catch(() => undefined)
  }

  async function restoreDefaultPrices() {
    if (!window.confirm('恢复系统默认价格？后台设置的价格将被删除，下一次生成起生效。')) return
    await onAction({ action: 'reset-prices' }, '已恢复默认价格').catch(() => undefined)
  }

  return <section className="mt-4">
    <div className="flex items-center gap-2"><h2 className="text-sm font-medium">系统设置</h2><span className="text-xs text-[var(--app-muted)]">生图价格 · 仅管理员可见</span></div>
    <div className="mt-4 max-w-xl">
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">生图价格</h2>
          <span className="rounded-sm bg-[var(--app-raised)] px-2 py-0.5 text-xs text-[var(--app-secondary)]">
            当前来源：{PRICE_SOURCE_LABEL[config.priceSource]}
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--app-muted)]">单位：点/次。改动从下一次生成起生效，已扣点数按原记录退款。</p>
        <table className="mt-4 w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="text-[var(--app-muted)]">
              <th className="w-24 py-2 text-left font-medium">尺寸</th>
              <th className="px-2 py-2 text-left font-medium">普通</th>
              <th className="py-2 text-left font-medium">VIP</th>
            </tr>
          </thead>
          <tbody>
            {PRICE_KEYS.map(size => <tr key={size} className="border-t border-[var(--app-border)]">
              <td className="py-2 font-medium text-[var(--app-secondary)]">{SIZE_LABEL[size]}</td>
              {(['regular', 'vip'] as const).map(tier => <td key={tier} className={tier === 'regular' ? 'px-2 py-2' : 'py-2'}>
                <label className="flex items-center gap-1">
                  <input
                    type="number" min={1} max={10000} step={1} required
                    aria-label={`${SIZE_LABEL[size]}${TIER_LABEL[tier]}点数`}
                    value={priceForm[size][tier]}
                    onChange={event => updatePrice(size, tier, event.target.value)}
                    className={inputClass}
                  />
                  <span className="shrink-0 text-[var(--app-muted)]">点</span>
                </label>
              </td>)}
            </tr>)}
          </tbody>
        </table>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void savePrices()} className={primaryButton}>保存价格</button>
          <button type="button" disabled={busy} onClick={() => void restoreDefaultPrices()} className={secondaryButton}>恢复默认</button>
        </div>
      </div>
    </div>
  </section>
}

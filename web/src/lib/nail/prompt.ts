import { loadSystemPrompt } from './image-provider'

const FILTERED_WORDS = ['好看', '精致', '高级感', '网红', '美颜', '瘦']
const fallbackSystem =
  '你是美甲效果预览器。优先级：保留顾客原手 > 可施工 > 美观。图1是唯一手部来源：不改变手指数量、姿态、比例、肤色、纹理、血管、皱纹、痣、疤、倒刺、原甲型甲长、首饰、背景或视角；禁止磨皮、美白、瘦手、拉长手指、消除瑕疵，不臆造模糊细节。图2只参考颜色、花纹、材质，忽略其中的手、背景、字、水印；图案只画在甲面并贴合弧度。设计适配原甲，使用常见胶、猫眼、贴饰和手绘工艺；不做悬空饰品、密集堆钻、超长甲或不现实光效。不适配时简化款式，不改原手。preview 保持原光线背景；promo 可轻微整理背景和光线，但保留原手及皮肤瑕疵。只输出一张真实、协调、普通美甲师可完成的效果图。'

export async function buildNailPrompt(input: {
  mode: 'preview' | 'promo'
  styleName: string
  extraPrompt: string
  size: '1k' | '4k'
}): Promise<{ prompt: string; filtered: boolean; extraPrompt: string }> {
  const system = (await loadSystemPrompt().catch(() => '')).trim() || fallbackSystem
  let extra = input.extraPrompt.replace(/\s+/g, ' ').trim().slice(0, 200)
  let filtered = false
  for (const word of FILTERED_WORDS) {
    if (extra.includes(word)) {
      extra = extra.split(word).join('')
      filtered = true
    }
  }
  const description = input.styleName.trim().slice(0, 60)
  const mode = input.mode === 'promo' ? 'promo（宣传展示）' : 'preview（真实沟通）'
  const prefix = `${system}\n模式：${mode}。款式：${description}。`
  const suffix = `款式拼图取最符合描述的一款；甲型与长度按图1原样。尺寸：${input.size.toUpperCase()}。`
  if (prefix.length + suffix.length > 1000) throw new Error('内置提示词过长，请联系管理员检查配置')
  extra = extra.slice(0, Math.max(0, 1000 - prefix.length - suffix.length - 5))
  const prompt = `${prefix}${extra ? `补充：${extra}。` : ''}${suffix}`
  return { prompt, filtered, extraPrompt: extra }
}

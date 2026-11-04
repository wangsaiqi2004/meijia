import { db } from './db'
import { createCraftNotes, editNailImage } from './image-provider'
import { finishGeneration } from './ledger'
import { deleteStoredFile } from './storage'

export async function runNailGeneration(input: {
  id: string
  handPath: string
  stylePath: string
  prompt: string
  size: '1k' | '4k'
  styleName: string
  extraPrompt: string
  mode?: 'preview' | 'promo'
}): Promise<void> {
  let outputPath = ''
  let apiCostCents = 0
  try {
    const output = await editNailImage({
      handPath: input.handPath,
      stylePath: input.stylePath,
      prompt: input.prompt,
      size: input.size,
      styleName: input.styleName,
      mode: input.mode,
    })
    outputPath = output.outputPath
    apiCostCents = output.apiCostCents
  } catch (error) {
    await finishGeneration(db, input.id, { success: false, reason: error instanceof Error ? error.message : '生图失败' })
    return
  }

  const finished = await finishGeneration(db, input.id, { success: true, outputPath, apiCostCents })
  if (!finished) {
    await deleteStoredFile(outputPath)
    return
  }

  try {
    const notes = await createCraftNotes(input.styleName, input.extraPrompt)
    if (notes) await db.generation.update({ where: { id: input.id }, data: { notesJson: JSON.stringify(notes) } })
  } catch {
    // Craft notes are optional and must not change a successful image task into a refund.
  }
}

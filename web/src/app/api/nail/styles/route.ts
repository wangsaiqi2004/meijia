import { NextResponse } from 'next/server'
import { db } from '@/lib/nail/db'
import { listEnabledStyles } from '@/lib/nail/styles'

export async function GET() {
  const styles = await listEnabledStyles(db)
  return NextResponse.json({ styles })
}

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'payment integration is not enabled' }, { status: 501 })
}

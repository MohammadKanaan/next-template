import { connection, NextResponse } from 'next/server'
import { checkHealth } from '@/lib/data/health'

export async function GET() {
  // A probe must reflect the services right now, so this never runs at build time.
  await connection()
  const health = await checkHealth()
  return NextResponse.json(health, { status: health.status === 'ok' ? 200 : 503 })
}

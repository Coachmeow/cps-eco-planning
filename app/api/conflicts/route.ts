import { NextRequest, NextResponse } from 'next/server'
import { getMonthlyConflicts } from '@/lib/conflicts'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const year  = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
  const data  = await getMonthlyConflicts(year, month)
  return NextResponse.json(data)
}

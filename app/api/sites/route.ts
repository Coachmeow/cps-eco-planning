import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const sites = await prisma.site.findMany({ orderBy: { code: 'asc' } })
  return NextResponse.json(sites)
}

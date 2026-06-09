import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const teams = await prisma.serviceTeam.findMany({ orderBy: { id: 'asc' } })
  return NextResponse.json(teams)
}

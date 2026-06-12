import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function GET() {
  const sites = await prisma.site.findMany({ orderBy: { code: 'asc' } })
  return NextResponse.json(sites)
}

export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const body = await req.json()
    const site = await prisma.site.create({
      data: {
        code:           body.code.toUpperCase().trim(),
        name:           body.name,
        clientName:     body.clientName   || null,
        province:       body.province     || null,
        region:         body.region       || null,
        color:          body.color        || 'emerald',
        requiresAccess: body.requiresAccess ?? [],
      },
    })
    return NextResponse.json(site, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

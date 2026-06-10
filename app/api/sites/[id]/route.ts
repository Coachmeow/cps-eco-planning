import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const site = await prisma.site.update({
      where: { id: parseInt(id) },
      data: {
        code:           body.code.toUpperCase().trim(),
        name:           body.name,
        clientName:     body.clientName   || null,
        region:         body.region       || null,
        color:          body.color        || 'emerald',
        requiresAccess: body.requiresAccess ?? [],
      },
    })
    return NextResponse.json(site)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.site.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

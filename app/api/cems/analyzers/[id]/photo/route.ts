import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// เสิร์ฟรูปเครื่องจาก photoUrl (base64) เป็นไฟล์ภาพ + cache ได้
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await prisma.cemsAnalyzer.findUnique({
    where:  { id: parseInt(id) },
    select: { photoUrl: true },
  })
  const url = a?.photoUrl
  if (!url) return new NextResponse(null, { status: 404 })
  if (!url.startsWith('data:')) return NextResponse.redirect(url)

  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(url)
  if (!m) return new NextResponse(null, { status: 404 })
  return new NextResponse(Buffer.from(m[2], 'base64'), {
    headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=300' },
  })
}

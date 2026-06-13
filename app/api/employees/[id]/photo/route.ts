import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// เสิร์ฟรูปพนักงานจาก photoUrl (base64 data URL) เป็นไฟล์ภาพ + cache ได้
// แยกจาก list endpoint เพื่อไม่ให้ base64 ก้อนใหญ่ไหลมากับทุก query
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const emp = await prisma.employee.findUnique({
    where:  { id: parseInt(id) },
    select: { photoUrl: true },
  })
  const url = emp?.photoUrl
  if (!url) return new NextResponse(null, { status: 404 })

  // ถ้าเป็น URL ภายนอก (อนาคต) → redirect ไปที่ปลายทาง
  if (!url.startsWith('data:')) return NextResponse.redirect(url)

  // data:[mime];base64,XXXX
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(url)
  if (!m) return new NextResponse(null, { status: 404 })
  const mime = m[1]
  const buf  = Buffer.from(m[2], 'base64')

  return new NextResponse(buf, {
    headers: {
      'Content-Type':  mime,
      'Cache-Control': 'private, max-age=300',
    },
  })
}

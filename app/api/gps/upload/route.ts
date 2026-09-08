import { NextRequest, NextResponse } from 'next/server'
import { requireRole, forbidden } from '@/lib/auth'
import { processGpsBuffer } from '@/lib/gps/ingest'

// อัปโหลดไฟล์ Cartrack (.xls) รายวันด้วยมือ (ADMIN/MANAGER) — bootstrap/backfill ของ auto Gmail
export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const report = await processGpsBuffer(buf, `upload:${file.name}`)
    return NextResponse.json(report)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

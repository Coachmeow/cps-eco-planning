import { NextRequest, NextResponse } from 'next/server'
import { processGpsBuffer } from '@/lib/gps/ingest'

// รับไฟล์ Cartrack อัตโนมัติจาก Google Apps Script (ยิงมาทุกวัน)
// auth ด้วย secret (header x-ingest-secret หรือ ?secret=) เทียบกับ env GPS_INGEST_SECRET
// รับได้ทั้ง multipart (field 'file') และ base64 (JSON { file, name })
export async function POST(req: NextRequest) {
  const secret = process.env.GPS_INGEST_SECRET
  if (!secret) return NextResponse.json({ error: 'ยังไม่ได้ตั้งค่า GPS_INGEST_SECRET' }, { status: 503 })

  // trim กันช่องว่าง/บรรทัดใหม่แฝงใน env หรือ header
  const exp = secret.trim()
  const provided = (req.headers.get('x-ingest-secret') || req.nextUrl.searchParams.get('secret') || '').trim()
  if (provided !== exp) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    let buf: Buffer | null = null
    let name = 'gmail'
    const ctype = req.headers.get('content-type') || ''

    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })
      name = (form.get('name') as string) || file.name || name
      buf = Buffer.from(await file.arrayBuffer())
    } else {
      // JSON base64 (เผื่อ Apps Script ส่งแบบ base64)
      const body = await req.json().catch(() => null)
      if (!body?.file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })
      name = body.name || name
      buf = Buffer.from(String(body.file), 'base64')
    }

    const report = await processGpsBuffer(buf, `gmail:${name}`)
    return NextResponse.json(report)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

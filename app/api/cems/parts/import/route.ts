import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'
import { toDateKey } from '@/lib/dateKey'

// นำเข้ารายการอะไหล่จาก Excel (โครงเดิมของหน่วยงาน)
// คอลัมน์: No | รหัส | ชื่อรายการ | หน่วย | สถานะ | Stock | ต้นทุน | มูลค่า | Reorder | ใช้ตามแผน | ต้องสั่งเพิ่ม | ตำแหน่ง
// กติกา: รหัสซ้ำ → แยกรายการ (ต่อท้าย -2, -3) · Reorder ติดลบ → 0 · ตำแหน่ง "0" → ว่าง
//        ยอดตั้งต้น = txn IN 1 รายการ (note "ยอดยกมาจาก Excel") · refCost = ต้นทุนใน Excel
const BRAND_MAP: Record<string, string> = { BEK: 'BEKO', DUR: 'Durag', OPS: 'OPSIS', MIS: 'อื่นๆ' }

export async function POST(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })
    const openingDate = form.get('date') ? new Date(String(form.get('date'))) : new Date(toDateKey(new Date()))

    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })

    const existing = await prisma.cemsSparePart.findMany({ select: { code: true } })
    const taken = new Set(existing.map(p => p.code))

    let created = 0, skipped = 0, renamed = 0
    const report: string[] = []

    for (let i = 2; i < rows.length; i++) {
      const r = rows[i]
      const rawCode = String(r[1] ?? '').trim()
      const name    = String(r[2] ?? '').trim()
      if (!rawCode || !name) { continue }

      // รหัสซ้ำ (ทั้งในไฟล์และใน DB) → แยกรายการ ต่อท้าย -2, -3, ...
      let code = rawCode
      if (taken.has(code)) {
        let n = 2
        while (taken.has(`${rawCode}-${n}`)) n++
        code = `${rawCode}-${n}`
        renamed++
        report.push(`${rawCode} ซ้ำ → บันทึกเป็น ${code}`)
      }
      taken.add(code)

      const unit     = String(r[3] ?? '').trim() || null
      const stock    = Number(r[5]) || 0
      const cost     = Number(r[6]) || 0
      const reorder  = Math.max(0, Math.round(Number(r[8]) || 0))   // ติดลบ → 0
      const locRaw   = String(r[11] ?? '').trim()
      const location = locRaw && locRaw !== '0' ? locRaw : null
      const prefix   = (rawCode.match(/^[A-Za-z]+/) ?? [''])[0].toUpperCase()

      const part = await prisma.cemsSparePart.create({
        data: {
          code, name, unit,
          brand:    BRAND_MAP[prefix] ?? prefix ?? null,
          minStock: reorder,
          location,
          refCost:  cost > 0 ? cost : null,
          notes:    code !== rawCode ? `รหัสเดิมในไฟล์: ${rawCode}` : null,
        },
      })

      // ยอดตั้งต้น (เฉพาะที่มีของ) — เป็น IN หนึ่งรายการ ให้ตรวจย้อนได้ว่ามาจากไหน
      if (stock > 0) {
        await prisma.cemsPartTxn.create({
          data: {
            partId: part.id, type: 'IN', qty: stock,
            unitCost: cost > 0 ? cost : null,
            txnDate: openingDate,
            notes: 'ยอดยกมาจาก Excel',
          },
        })
      }
      created++
    }

    // นับรายการที่ถูกข้าม (แถวว่าง/ไม่มีรหัส)
    skipped = Math.max(0, rows.length - 2 - created)
    return NextResponse.json({ ok: true, created, renamed, skipped, report })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

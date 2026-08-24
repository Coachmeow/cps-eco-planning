import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { matchProvince, PROVINCES } from '@/lib/thailandGeo'

// สภาพอากาศเสี่ยง (ฝน/ร้อน) ของจังหวัดที่มีงานล่วงหน้า 3 วัน (วันนี้ + อีก 2 วัน)
// แหล่ง: Open-Meteo (ฟรี ไม่ต้องมี API key) · เรียก batch หลายพิกัดในคำขอเดียว · cache 1 ชม.
// ส่งออกเฉพาะพิกัดจังหวัด (ข้อมูลสาธารณะ) — ไม่มีข้อมูลส่วนบุคคล

const LATLON = new Map(PROVINCES.map((p) => [p.th, { lat: p.lat, lon: p.lon }]))

// ระดับความเสี่ยง 0=ปกติ 1=เฝ้าระวัง 2=อันตราย
function rainLevel(prob: number): number { return prob >= 80 ? 2 : prob >= 60 ? 1 : 0 }
function heatLevel(tmax: number): number { return tmax >= 40 ? 2 : tmax >= 37 ? 1 : 0 }

interface OMDaily { time: string[]; precipitation_probability_max: (number | null)[]; temperature_2m_max: (number | null)[] }
interface OMResult { daily: OMDaily }

export async function GET() {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(start.getDate() + 2)

  // จังหวัดที่มีงานในหน้าต่าง 3 วัน (รวมวันลูกของงานหลายวันเพื่อจับพื้นที่ที่มีคนอยู่)
  const rows = await prisma.staffAssignment.findMany({
    where: { assignedDate: { gte: start, lte: end }, status: 'FIELD', siteId: { not: null } },
    select: { site: { select: { province: true } } },
  })
  const names = new Set<string>()
  for (const r of rows) {
    const p = matchProvince(r.site?.province)
    if (p && LATLON.has(p)) names.add(p)
  }
  const list = [...names]
  if (list.length === 0) return NextResponse.json({ days: [], provinces: [] })

  const lat = list.map((n) => LATLON.get(n)!.lat).join(',')
  const lon = list.map((n) => LATLON.get(n)!.lon).join(',')
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=precipitation_probability_max,temperature_2m_max&forecast_days=3&timezone=Asia%2FBangkok`

  let arr: OMResult[]
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`open-meteo ${res.status}`)
    const data = await res.json()
    arr = Array.isArray(data) ? data : [data] // คืน object เดี่ยวเมื่อมีพิกัดเดียว
  } catch {
    return NextResponse.json({ days: [], provinces: [], error: true })
  }

  const days: string[] = arr[0]?.daily?.time ?? []
  const provinces = list.map((name, i) => {
    const d = arr[i]?.daily
    const daily = (d?.time ?? []).map((date, k) => {
      const rainProb = Math.round(d!.precipitation_probability_max[k] ?? 0)
      const tmax = Math.round((d!.temperature_2m_max[k] ?? 0) * 10) / 10
      const rl = rainLevel(rainProb)
      const hl = heatLevel(tmax)
      const level = Math.max(rl, hl)
      const kind = level === 0 ? 'ok' : rl >= hl ? 'rain' : 'heat'
      return { date, rainProb, tmax, level, kind }
    })
    const worst = daily.reduce((m, x) => Math.max(m, x.level), 0)
    return { name, daily, worst }
  }).sort((a, b) => b.worst - a.worst || a.name.localeCompare(b.name, 'th'))

  return NextResponse.json({ days, provinces })
}

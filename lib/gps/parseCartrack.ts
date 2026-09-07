// อ่านไฟล์ Cartrack "Custom Trip Detail Report" (.xls) → ping ที่ normalize แล้ว
// หมายเหตุเวลา: คอลัมน์ Event เป็น Excel serial ที่เป็น "เวลาไทยอยู่แล้ว" (ยืนยันจากไฟล์จริง
//   ช่วง 06:08–23:59 ในวันเดียวกับ header) → เก็บเป็น UTC-naive (wall clock) แล้ว format แบบ UTC
import * as XLSX from 'xlsx'

export interface GpsPing {
  plate: string        // ทะเบียน (normalize แล้ว)
  ts: Date             // เวลาไทย เก็บเป็น UTC-naive → format ด้วย timeZone:'UTC'
  dayKey: string       // 'YYYY-MM-DD' (เวลาไทย) สำหรับ group ต่อวัน
  lat: number
  lng: number
  speed: number        // km/h
  eventType: string    // Ignition ON / Ignition OFF / Idle / ...
  driver: string
  place: string        // Position Description (ที่อยู่ไทย)
}

// Excel serial → Date (ถือ serial เป็น wall clock เก็บลง UTC ตรง ๆ)
function serialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000))
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : NaN
}

// ทะเบียน: ตัดช่องว่างทั้งหมด (กันไฟล์/ระบบเว้นวรรคไม่ตรงกัน)
export function normalizePlate(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, '').trim()
}

export function parseCartrack(buf: Buffer): GpsPing[] {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })

  // หาแถวหัวตาราง (คอลัมน์แรก = 'Username')
  let head = -1
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    if (String(rows[i]?.[0] ?? '').trim().toLowerCase() === 'username') { head = i; break }
  }
  if (head < 0) return []

  const pings: GpsPing[] = []
  for (let i = head + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !r[0]) continue
    const plate = normalizePlate(r[1])
    const serial = num(r[2])
    const lng = num(r[3])
    const lat = num(r[4])
    if (!plate || !Number.isFinite(serial) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (lat === 0 && lng === 0) continue

    const ts = serialToDate(serial)
    const dayKey = ts.toISOString().slice(0, 10)   // UTC = wall clock ไทย
    pings.push({
      plate, ts, dayKey, lat, lng,
      speed: Math.max(0, num(r[5]) || 0),
      eventType: String(r[13] ?? '').trim(),
      driver: String(r[12] ?? '').trim(),
      place: String(r[9] ?? '').trim(),
    })
  }
  return pings
}

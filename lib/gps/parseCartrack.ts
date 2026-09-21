// อ่านไฟล์ Cartrack "Custom Trip Detail Report" (.xls) → ping ที่ normalize แล้ว
// หมายเหตุเวลา: คอลัมน์ Event เป็น Excel serial ที่เป็น "เวลาไทยอยู่แล้ว" (ยืนยันจากไฟล์จริง
//   ช่วง 06:08–23:59 ในวันเดียวกับ header) → เก็บเป็น UTC-naive (wall clock) แล้ว format แบบ UTC
// การอ่านคอลัมน์: จับ "ตามชื่อหัวตาราง" (ไม่ยึด index ตายตัว) → รองรับได้แม้ Cartrack
//   เลือกฟิลด์/สลับคอลัมน์ต่างจากเดิม ตราบใดที่ยังมีคอลัมน์ทะเบียน (Registration/Username)
import * as XLSX from 'xlsx'

export interface GpsPing {
  plate: string        // ทะเบียน (normalize แล้ว)
  ts: Date             // เวลาไทย เก็บเป็น UTC-naive → format ด้วย timeZone:'UTC'
  dayKey: string       // 'YYYY-MM-DD' (เวลาไทย) สำหรับ group ต่อวัน
  lat: number
  lng: number
  speed: number        // km/h
  roadSpeed: number    // km/h — ความเร็วจำกัดของถนน ณ จุดนั้น (0 = ไม่มีข้อมูล)
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

// ทะเบียน: เอาเฉพาะ "ส่วนทะเบียน" ก่อนเว้นวรรค — ตัดจังหวัดที่ต่อท้ายในระบบเราออก
//   Cartrack = "3ขง8314" · ระบบเรา = "3ขง8314 กรุงเทพฯ" → ทั้งคู่ normalize เป็น "3ขง8314"
// (ใช้ฟังก์ชันเดียวกันทั้งสองฝั่ง จึงจับคู่ตรงกันเสมอ)
export function normalizePlate(s: unknown): string {
  return String(s ?? '').trim().split(/\s+/)[0] ?? ''
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

// หาแถวหัวตาราง = แถวที่มีคอลัมน์พิกัด lat+lng (รับ alias ชุดเดียวกับตัวอ่านคอลัมน์ด้านล่าง)
const LAT_HDRS = ['latitude', 'lat']
const LNG_HDRS = ['longitude', 'lng', 'long', 'lon']
function findHeader(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = (rows[i] ?? []).map(norm)
    if (cells.some(c => LAT_HDRS.includes(c)) && cells.some(c => LNG_HDRS.includes(c))) return i
  }
  return -1
}

export function parseCartrack(buf: Buffer): GpsPing[] {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: 'buffer' })
  } catch {
    throw new Error('เปิดไฟล์ไม่ได้ (ไม่ใช่ไฟล์ Excel .xls/.xlsx ที่ถูกต้อง)')
  }
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('ไฟล์ไม่มีข้อมูล (ไม่พบชีตแรก)')
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })

  const head = findHeader(rows)
  if (head < 0) throw new Error('ไม่พบตารางข้อมูล GPS ในไฟล์ (ไม่เจอหัวคอลัมน์ Longitude/Latitude) — ตรวจว่าเป็นรายงาน Custom Trip Detail ของ Cartrack')

  // หัวตาราง → index ตามชื่อ (lowercase)
  const idx = new Map<string, number>()
  ;(rows[head] ?? []).forEach((h, i) => { const k = norm(h); if (k && !idx.has(k)) idx.set(k, i) })
  const col = (...names: string[]) => { for (const n of names) { const i = idx.get(n); if (i != null) return i } return -1 }

  // ทะเบียนรถ — ต้องมี ไม่งั้น attribute เข้ารถไม่ได้
  let plateI = col('registration', 'registration no', 'registration number', 'reg no', 'regno',
    'fleet number', 'fleet no', 'vehicle registration', 'vehicle', 'license plate', 'licence plate',
    'plate', 'number plate', 'ทะเบียน', 'ทะเบียนรถ')
  // เผื่อ layout เดิม: คอลัมน์ทะเบียนอยู่ถัดจาก "Username" (Username=บัญชี, ถัดไป=ทะเบียน)
  if (plateI < 0 && idx.has('username')) plateI = idx.get('username')! + 1

  const eventI = col('event', 'event time', 'date time', 'date/time', 'timestamp', 'datetime')
  const lngI = col(...LNG_HDRS)
  const latI = col(...LAT_HDRS)
  const speedI = col('speed', 'speed (km/h)')
  const roadI = col('road speed', 'speed limit', 'road speed limit')
  const placeI = col('position description', 'position', 'location', 'address')
  const driverI = col('driver name', 'driver')
  const typeI = col('event type', 'type', 'status')

  if (plateI < 0) {
    throw new Error('ไฟล์นี้ไม่มีคอลัมน์ทะเบียนรถ (Registration) จึงจับคู่รถไม่ได้ — โปรดตั้งค่ารายงานใน Cartrack ให้ติ๊กฟิลด์ "Registration No" ด้วย แล้วส่ง/อัปโหลดไฟล์ใหม่')
  }
  if (eventI < 0 || lngI < 0 || latI < 0) {
    throw new Error('รูปแบบคอลัมน์ไม่ครบ (ต้องมี Event, Longitude, Latitude)')
  }

  const pings: GpsPing[] = []
  for (let i = head + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    const plate = normalizePlate(r[plateI])
    const serial = num(r[eventI])
    const lng = num(r[lngI])
    const lat = num(r[latI])
    if (!plate || !Number.isFinite(serial) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (lat === 0 && lng === 0) continue

    const ts = serialToDate(serial)
    const dayKey = ts.toISOString().slice(0, 10)   // UTC = wall clock ไทย
    pings.push({
      plate, ts, dayKey, lat, lng,
      speed: Math.max(0, roadIval(r, speedI)),
      roadSpeed: Math.max(0, roadIval(r, roadI)),
      eventType: typeI >= 0 ? String(r[typeI] ?? '').trim() : '',
      driver: driverI >= 0 ? String(r[driverI] ?? '').trim() : '',
      place: placeI >= 0 ? String(r[placeI] ?? '').trim() : '',
    })
  }
  return pings
}

// อ่านค่าตัวเลขจากคอลัมน์ (คืน 0 ถ้าไม่มีคอลัมน์/ค่าไม่ใช่ตัวเลข)
function roadIval(r: unknown[], i: number): number {
  if (i < 0) return 0
  const n = num(r[i])
  return Number.isFinite(n) ? n : 0
}

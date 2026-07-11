import { NextRequest, NextResponse } from 'next/server'

// รหัสรวม (common) กันคนสแกน QR มั่ว / ข้อมูลรั่ว สำหรับหน้า public CEMS (analyzer + gas)
// ตั้งค่าใน env CEMS_QR_PIN (แนะนำ 6 หลัก) ; ไม่ตั้ง = ไม่บังคับรหัส (backward-compat)
const CEMS_QR_PIN = process.env.CEMS_QR_PIN || ''

// rate-limit กัน brute-force: ผิดเกิน MAX ครั้งต่อ IP ใน WINDOW → บล็อกชั่วคราว
// (Railway รัน container ถาวร → Map ระดับโมดูลอยู่ข้ามรีเควสต์ได้ ; ใช้ bucket เดียวร่วมทุกหน้า)
const MAX_FAIL = 5
const WINDOW_MS = 5 * 60_000
const fails = new Map<string, { count: number; first: number }>()

function clientIp(req: NextRequest) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
}
function isBlocked(ip: string) {
  const rec = fails.get(ip)
  if (!rec) return false
  if (Date.now() - rec.first > WINDOW_MS) { fails.delete(ip); return false }
  return rec.count >= MAX_FAIL
}
function noteFail(ip: string) {
  const now = Date.now()
  const rec = fails.get(ip)
  if (!rec || now - rec.first > WINDOW_MS) fails.set(ip, { count: 1, first: now })
  else rec.count++
  if (fails.size > 5000) fails.clear() // กัน map โตไม่จำกัด
}

// ตรวจสิทธิ์เข้าหน้า public: ok / 401 (ยังไม่ใส่หรือใส่ผิด) / 429 (ยิงผิดถี่เกิน)
export function checkQrAccess(req: NextRequest): { ok: true } | { ok: false; res: NextResponse } {
  if (!CEMS_QR_PIN) return { ok: true }
  const ip = clientIp(req)
  if (isBlocked(ip)) return { ok: false, res: NextResponse.json({ error: 'ลองผิดหลายครั้ง กรุณารอสักครู่' }, { status: 429 }) }
  const given = req.headers.get('x-cems-pin') || ''
  if (!given) return { ok: false, res: NextResponse.json({ error: 'ต้องใส่รหัส' }, { status: 401 }) } // probe แรก ไม่นับผิด
  if (given === CEMS_QR_PIN) { fails.delete(ip); return { ok: true } }
  noteFail(ip)
  return { ok: false, res: NextResponse.json({ error: 'รหัสไม่ถูกต้อง' }, { status: 401 }) }
}

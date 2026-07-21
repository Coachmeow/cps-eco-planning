'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Comp { id: number; gas: string; concentration: number; unit: string }
interface ReadingRow { id: number; pressure: number; readingDate: string; reader: string | null; purpose: string | null; usageLocation: string | null; notes: string | null }
interface PageData {
  id: number; cylinderNo: string; brand: string | null; size: string | null
  initialPressure: number; currentPressure: number; lowThreshold: number | null; initialWeight: number | null
  status: string; location: string | null; expiryDate: string | null; returnDueDate: string | null
  components: Comp[]; readings: ReadingRow[]; pct: number; kgRemaining: number | null
}

const PIN_LEN = 6
const REMEMBER_MS = 7 * 24 * 60 * 60 * 1000
const PIN_KEY = 'cemsqr_pin' // ใช้รหัสรวมชุดเดียวกับหน้า analyzer
function readSavedPin(): string | null {
  try { const o = JSON.parse(localStorage.getItem(PIN_KEY) || 'null'); if (o && o.exp > Date.now()) return o.p } catch {}
  return null
}
function saveSavedPin(p: string) { try { localStorage.setItem(PIN_KEY, JSON.stringify({ p, exp: Date.now() + REMEMBER_MS })) } catch {} }
function clearSavedPin() { try { localStorage.removeItem(PIN_KEY) } catch {} }

const STATUS_TH: Record<string, string> = { ACTIVE: 'ใช้งานได้', EMPTY: 'หมด', RETURNED: 'ส่งคืน' }
const compText = (c: Comp) => `${c.gas} ${c.concentration}${c.unit === '%' || c.unit === 'vol%' ? c.unit : ' ' + c.unit}`
const fmtD = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-800 focus:border-slate-500 focus:outline-none'
const lbl = 'mb-1 block text-sm font-medium text-slate-600'

export default function CemsGasPublicPage() {
  const { token } = useParams<{ token: string }>()
  const [pin, setPin] = useState('')
  const [needPin, setNeedPin] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [data, setData] = useState<PageData | null>(null)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [pressure, setPressure] = useState('')
  const [markEmpty, setMarkEmpty] = useState(false)
  const [markReturned, setMarkReturned] = useState(false)
  const [returnedBy, setReturnedBy] = useState('')
  const [reader, setReader] = useState('')
  const [purpose, setPurpose] = useState('')
  const [usageLocation, setUsageLocation] = useState('')
  const [notes, setNotes] = useState('')

  const load = useCallback((tryPin?: string) => {
    const headers: Record<string, string> = {}
    if (tryPin) headers['x-cems-pin'] = tryPin
    return fetch(`/api/public/cems-gas/${token}`, { headers }).then(async r => {
      if (r.status === 429) { setNeedPin(true); setData(null); setErr('ลองผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่'); return false }
      if (r.status === 401) { setNeedPin(true); setData(null); if (tryPin) { setErr('รหัสไม่ถูกต้อง'); clearSavedPin() } return false }
      if (!r.ok) { setErr('ไม่พบถัง หรือ QR ไม่ถูกต้อง'); return false }
      setNeedPin(false); setErr(''); setData(await r.json()); if (tryPin) setPin(tryPin)
      return true
    }).catch(() => { setErr('เชื่อมต่อไม่ได้'); return false })
  }, [token])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? readSavedPin() : null
    load(saved || undefined)
  }, [load])

  async function trySubmitPin(code: string) {
    const ok = await load(code)
    if (ok) { saveSavedPin(code); setPinInput('') }
  }
  function onPinChange(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, PIN_LEN)
    setPinInput(digits); setErr('')
    if (digits.length === PIN_LEN) trySubmitPin(digits)
  }

  async function submit() {
    const hasP = pressure.trim() !== ''
    if (!hasP && !markEmpty && !markReturned) { setErr('กรอกความดัน / ถังหมด / ส่งคืนท่อ'); return }
    setSubmitting(true); setErr('')
    const r = await fetch(`/api/public/cems-gas/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(pin ? { 'x-cems-pin': pin } : {}) },
      body: JSON.stringify({ pressure: hasP ? pressure : undefined, markEmpty, markReturned, returnedBy: markReturned ? (returnedBy || undefined) : undefined, reader: reader || undefined, purpose: purpose || undefined, usageLocation: usageLocation || undefined, notes: notes || undefined }),
    })
    setSubmitting(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'บันทึกไม่สำเร็จ'); return }
    setDone(true)
  }

  // ── หน้ารหัสรวม ──
  if (needPin && !data) return (
    <Center>
      <div className="w-full max-w-xs text-center">
        <div className="mb-3 text-5xl">🔒</div>
        <p className="text-lg font-bold text-slate-800">ใส่รหัสเข้าใช้งาน</p>
        <p className="mt-1 mb-4 text-sm text-slate-400">หน้าอัปเดตถังแก๊ส CEMS · เฉพาะเจ้าหน้าที่</p>
        <input type="password" inputMode="numeric" autoComplete="off" value={pinInput} autoFocus maxLength={PIN_LEN}
          onChange={e => onPinChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && pinInput) trySubmitPin(pinInput) }}
          className={`${inp} text-center text-2xl tracking-[0.5em]`} placeholder="••••••" />
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <button onClick={() => pinInput && trySubmitPin(pinInput)}
          className="mt-4 w-full rounded-xl bg-slate-700 py-3 text-base font-semibold text-white hover:bg-slate-800">เข้าใช้งาน</button>
        <p className="mt-3 text-[11px] text-slate-400">ใส่รหัส {PIN_LEN} หลัก · จำไว้ 7 วันในเครื่องนี้</p>
      </div>
    </Center>
  )

  if (err && !data) return <Center><p className="text-red-600">{err}</p></Center>
  if (!data) return <Center><p className="text-slate-400">กำลังโหลด...</p></Center>

  if (done) return (
    <Center>
      <div className="text-center">
        <div className="mb-3 text-5xl">✅</div>
        <p className="text-lg font-bold text-slate-800">บันทึกแล้ว</p>
        <p className="mt-1 text-sm text-slate-500">{data.cylinderNo}</p>
        <button onClick={() => { setDone(false); setPressure(''); setMarkEmpty(false); setMarkReturned(false); setReturnedBy(''); setPurpose(''); setUsageLocation(''); setNotes(''); load(pin || undefined) }}
          className="mt-5 rounded-lg bg-slate-700 px-5 py-2 text-sm font-medium text-white">เสร็จสิ้น</button>
      </div>
    </Center>
  )

  const low = data.lowThreshold != null ? data.currentPressure <= data.lowThreshold : data.pct < 20
  const barCls = low || data.pct < 20 ? 'bg-red-500' : data.pct < 50 ? 'bg-amber-400' : 'bg-emerald-500'
  const p = parseFloat(pressure)
  const preview = !isNaN(p) && data.initialPressure > 0 ? Math.max(0, Math.min(100, Math.round((p / data.initialPressure) * 100))) : null

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4">
      <div className="mx-auto max-w-md pb-10">
        {/* header */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-bold tracking-widest text-indigo-600">CPS ECO · CEMS แก๊สมาตรฐาน</p>
          <p className="mt-1 text-xl font-bold text-slate-800">🧪 {data.cylinderNo}</p>
          <p className="text-sm text-slate-400">{[data.brand, data.size].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {data.components.map(c => <span key={c.id} className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">{compText(c)}</span>)}
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">คงเหลือ</span>
              <span className={`font-bold ${low ? 'text-red-600' : 'text-slate-700'}`}>{data.currentPressure} / {data.initialPressure} psi · {data.pct}%{data.kgRemaining != null ? ` · ${data.kgRemaining} kg` : ''}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full ${barCls}`} style={{ width: `${data.pct}%` }} />
            </div>
            {low && <p className="mt-1 text-xs text-red-600">⚠ ใกล้หมด — ความดันต่ำ ควรเตรียมเปลี่ยนถัง</p>}
            {(() => {
              if (!data.returnDueDate || data.status === 'RETURNED') return null
              const d = Math.ceil((new Date(data.returnDueDate).getTime() - Date.now()) / 86_400_000)
              const due = new Date(data.returnDueDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
              if (d < 0) return <p className="mt-1 text-xs font-semibold text-red-600">↩ เลยกำหนดส่งคืน {-d} วัน ({due}) — เสียค่าเช่า</p>
              if (d <= 30) return <p className="mt-1 text-xs font-semibold text-amber-600">↩ ต้องส่งคืนถังภายใน {d} วัน ({due})</p>
              return <p className="mt-1 text-xs text-slate-500">↩ ส่งคืนภายใน {due} (อีก {d} วัน)</p>
            })()}
            {data.status !== 'ACTIVE' && <p className="mt-1 text-xs text-slate-500">สถานะ: <b>{STATUS_TH[data.status] ?? data.status}</b></p>}
          </div>
        </div>

        {/* ฟอร์มอัปเดต */}
        <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <label className={lbl}>ความดันที่อ่านได้ (psi)</label>
            <input type="number" inputMode="numeric" value={pressure} onChange={e => setPressure(e.target.value)} className={inp} placeholder={`เต็ม = ${data.initialPressure}`} />
            {preview != null && <p className="mt-1 text-xs text-slate-500">คงเหลือ ≈ <b>{preview}%</b>{data.initialWeight != null && <> · {Math.round(data.initialWeight * preview / 100 * 100) / 100} kg</>}{data.lowThreshold != null && p <= data.lowThreshold && ' · ต่ำกว่าเกณฑ์ → จะมาร์คถังหมด'}</p>}
          </div>
          <label className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
            <input type="checkbox" checked={markEmpty} onChange={e => setMarkEmpty(e.target.checked)} className="h-4 w-4" />
            ถังนี้หมดแล้ว (มาร์คเป็น “หมด”)
          </label>
          <div className={`rounded-lg px-3 py-2.5 ${markReturned ? 'bg-sky-50' : 'bg-slate-50'}`}>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={markReturned} onChange={e => setMarkReturned(e.target.checked)} className="h-4 w-4" />
              ↩ ส่งคืนท่อแล้ว (มาร์คเป็น “ส่งคืนแล้ว”)
            </label>
            {markReturned && (
              <input value={returnedBy} onChange={e => setReturnedBy(e.target.value)} className={`${inp} mt-2`} placeholder="ชื่อผู้ส่งคืน" />
            )}
          </div>
          <div><label className={lbl}>วัตถุประสงค์ใช้งาน</label><input value={purpose} onChange={e => setPurpose(e.target.value)} className={inp} placeholder="เช่น สอบเทียบ zero/span" /></div>
          <div><label className={lbl}>สถานที่ใช้งาน</label><input value={usageLocation} onChange={e => setUsageLocation(e.target.value)} className={inp} placeholder="เช่น SKK3 / คลัง" /></div>
          <div><label className={lbl}>ผู้อ่าน</label><input value={reader} onChange={e => setReader(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>หมายเหตุ</label><input value={notes} onChange={e => setNotes(e.target.value)} className={inp} placeholder="อื่น ๆ" /></div>

          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
          <button onClick={submit} disabled={submitting}
            className="w-full rounded-xl bg-indigo-600 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>

        {/* ประวัติล่าสุด */}
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold text-slate-500">ประวัติความดันล่าสุด</p>
          {data.readings.length === 0 ? <p className="py-2 text-center text-xs text-slate-300">ยังไม่มี</p> : (
            <div className="space-y-1.5">
              {data.readings.map(rd => (
                <div key={rd.id} className="rounded-lg border border-slate-100 px-3 py-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-600">{rd.pressure} psi</span>
                    <span className="text-slate-400">{rd.reader && `${rd.reader} · `}{fmtD(rd.readingDate)}</span>
                  </div>
                  {(rd.purpose || rd.usageLocation) && (
                    <p className="mt-0.5 text-slate-500">{rd.purpose && <>🎯 {rd.purpose}</>}{rd.purpose && rd.usageLocation && ' · '}{rd.usageLocation && <>📍 {rd.usageLocation}</>}</p>
                  )}
                  {rd.notes && <p className="mt-0.5 text-slate-400">📝 {rd.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-100 p-4">{children}</div>
}

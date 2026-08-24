'use client'

import { useCallback, useEffect, useState } from 'react'
import { Lock, Send, Clock, Package } from 'lucide-react'
import { useParams } from 'next/navigation'
import PartWithdrawForm, { type WithdrawSchedule } from '@/components/cems/PartWithdrawForm'

// รหัสรวมชุดเดียวกับหน้า QR ถังแก๊ส/เครื่อง CEMS (ตั้งที่ env CEMS_QR_PIN — ไม่ตั้ง = ไม่ถาม)
const PIN_LEN = 6
const REMEMBER_MS = 7 * 24 * 60 * 60 * 1000
const PIN_KEY = 'cemsqr_pin'
function readSavedPin(): string | null {
  try { const o = JSON.parse(localStorage.getItem(PIN_KEY) || 'null'); if (o && o.exp > Date.now()) return o.p } catch {}
  return null
}
function saveSavedPin(p: string) { try { localStorage.setItem(PIN_KEY, JSON.stringify({ p, exp: Date.now() + REMEMBER_MS })) } catch {} }
function clearSavedPin() { try { localStorage.removeItem(PIN_KEY) } catch {} }

const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-800 focus:border-slate-500 focus:outline-none'

interface PageData {
  part: { id: number; code: string; name: string; unit: string | null; location: string | null; stock: number }
  employees: { id: number; nickname: string | null; fullName: string }[]
  sites: { id: number; code: string }[]
  analyzers: { id: number; tag: string; currentSiteId: number | null }[]
  schedules: WithdrawSchedule[]
}

export default function PartRequestPage() {
  const { token } = useParams<{ token: string }>()
  const [pin, setPin] = useState('')
  const [needPin, setNeedPin] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [data, setData] = useState<PageData | null>(null)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [doneQty, setDoneQty] = useState(0)
  const [formKey, setFormKey] = useState(0)

  const load = useCallback((tryPin?: string) => {
    const headers: Record<string, string> = {}
    if (tryPin) headers['x-cems-pin'] = tryPin
    return fetch(`/api/public/cems-part/${token}`, { headers }).then(async r => {
      if (r.status === 429) { setNeedPin(true); setData(null); setErr('ลองผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่'); return false }
      if (r.status === 401) { setNeedPin(true); setData(null); if (tryPin) { setErr('รหัสไม่ถูกต้อง'); clearSavedPin() } return false }
      if (!r.ok) { setErr('ไม่พบอะไหล่ หรือ QR ไม่ถูกต้อง'); return false }
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

  // ── หน้ารหัสรวม ──
  if (needPin && !data) return (
    <Center>
      <div className="w-full max-w-xs text-center">
        <div className="mb-3 flex justify-center"><Lock className="h-12 w-12 text-slate-300" /></div>
        <p className="text-lg font-bold text-slate-800">ใส่รหัสเข้าใช้งาน</p>
        <p className="mt-1 mb-4 text-sm text-slate-400">หน้าขอเบิกอะไหล่ CEMS · เฉพาะเจ้าหน้าที่</p>
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
        <div className="mb-3 flex justify-center"><Send className="h-12 w-12 text-emerald-500" /></div>
        <p className="text-lg font-bold text-slate-800">ส่งคำขอเบิกแล้ว</p>
        <p className="mt-1 text-sm text-slate-500">{data.part.code} · {doneQty.toLocaleString()} {data.part.unit ?? ''}</p>
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700"><Clock className="h-3.5 w-3.5 shrink-0" /> รอ CEMS Admin อนุมัติก่อน จึงจะตัด stock</p>
        <button onClick={() => { setDone(false); setFormKey(k => k + 1) }} className="mt-5 rounded-lg bg-slate-700 px-5 py-2 text-sm font-medium text-white">เบิกอีกรายการ</button>
      </div>
    </Center>
  )

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4">
      <div className="mx-auto max-w-md pb-10">
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-bold tracking-widest text-emerald-600">Eco Planning System · CEMS เบิกอะไหล่</p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-xl font-bold text-slate-800"><Package className="h-5 w-5 text-slate-500" /> {data.part.code}</p>
          <p className="text-sm text-slate-400">{data.part.name}</p>
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            คงเหลือในสต็อก: <span className="font-bold text-slate-700">{data.part.stock} {data.part.unit ?? ''}</span>
            {data.part.location && <span className="text-slate-400"> · ชั้น {data.part.location}</span>}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <PartWithdrawForm
            key={formKey}
            part={data.part}
            employees={data.employees}
            sites={data.sites}
            analyzers={data.analyzers}
            schedules={data.schedules}
            submitUrl={`/api/public/cems-part/${token}`}
            extraHeaders={pin ? { 'x-cems-pin': pin } : undefined}
            onDone={r => { setDoneQty(r.qty); setDone(true) }}
          />
        </div>
      </div>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-100 p-4">{children}</div>
}

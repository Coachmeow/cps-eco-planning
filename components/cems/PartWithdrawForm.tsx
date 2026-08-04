'use client'

// ฟอร์มเบิกอะไหล่ร่วม — ใช้ทั้งหน้า QR สาธารณะ (app/p/[token]) และ modal เบิกในระบบ (PartPlanSection)
// 3 โหมด: ตามแผน (ผูก schedule) / ชำรุดก่อนกำหนด (ผูก schedule ถ้ามี) / นอกแผน (ไม่ผูก)
import { useMemo, useState } from 'react'

export interface WithdrawPart { id: number; code: string; name: string; unit?: string | null }
export interface WithdrawEmployee { id: number; nickname: string | null; fullName: string }
export interface WithdrawSite { id: number; code: string }
export interface WithdrawAnalyzer { id: number; tag: string; currentSiteId: number | null }
export interface WithdrawSchedule {
  id: number
  analyzerId: number | null
  siteId: number | null
  mode: string
  nextDueDate: string | null
  analyzer: { id: number; tag: string } | null
  site: { id: number; code: string } | null
  overdue: boolean
  dueThisMonth: boolean
}
export type ReplaceType = 'PLANNED' | 'BREAKDOWN' | 'OTHER'
export interface WithdrawPrefill { mode?: ReplaceType; scheduleId?: number; analyzerId?: number; siteId?: number }
export interface WithdrawResult { qty: number }

export interface PartWithdrawFormProps {
  part: WithdrawPart
  employees: WithdrawEmployee[]
  sites: WithdrawSite[]
  analyzers: WithdrawAnalyzer[]
  schedules: WithdrawSchedule[]
  submitUrl: string
  extraBody?: Record<string, unknown>
  extraHeaders?: Record<string, string>   // หน้า QR สาธารณะ: แนบรหัสรวม x-cems-pin
  prefill?: WithdrawPrefill
  onDone: (result: WithdrawResult) => void
}

const fmtDue = (d: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : ''
const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-800 focus:border-slate-500 focus:outline-none'
const lbl = 'mb-1 block text-sm font-medium text-slate-600'

export default function PartWithdrawForm({ part, employees, sites, analyzers, schedules, submitUrl, extraBody, extraHeaders, prefill, onDone }: PartWithdrawFormProps) {
  const [mode, setMode] = useState<ReplaceType>(prefill?.mode ?? 'OTHER')
  const [requesterId, setRequesterId] = useState('')
  const [qty, setQty] = useState('1')
  const [scheduleId, setScheduleId] = useState(prefill?.scheduleId ? String(prefill.scheduleId) : '')
  const [breakdownTarget, setBreakdownTarget] = useState<'analyzer' | 'site'>(prefill?.siteId && !prefill?.analyzerId ? 'site' : 'analyzer')
  const [analyzerId, setAnalyzerId] = useState(prefill?.analyzerId ? String(prefill.analyzerId) : '')
  const [siteId, setSiteId] = useState(prefill?.siteId ? String(prefill.siteId) : '')
  const [manualSite, setManualSite] = useState('')
  const [quoteNo, setQuoteNo] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const plannedOptions = useMemo(() => schedules.filter(s => s.dueThisMonth || s.overdue), [schedules])
  const anOpts = useMemo(() => [...analyzers].sort((a, b) => {
    const sid = siteId ? parseInt(siteId) : null
    return (a.currentSiteId === sid ? 0 : 1) - (b.currentSiteId === sid ? 0 : 1)
  }), [analyzers, siteId])

  function pickSchedule(id: string) {
    setScheduleId(id)
    const s = schedules.find(x => String(x.id) === id)
    if (s) { setAnalyzerId(s.analyzerId ? String(s.analyzerId) : ''); setSiteId(s.siteId ? String(s.siteId) : '') }
  }
  function pickBreakdownAnalyzer(id: string) {
    setAnalyzerId(id); setBreakdownTarget('analyzer')
    const s = schedules.find(x => x.analyzerId === parseInt(id))
    setScheduleId(s ? String(s.id) : '')
  }
  function pickBreakdownSite(id: string) {
    setSiteId(id); setBreakdownTarget('site')
    const s = schedules.find(x => x.siteId === parseInt(id))
    setScheduleId(s ? String(s.id) : '')
  }
  function switchMode(m: ReplaceType) {
    setMode(m); setErr('')
    if (m === 'OTHER') setScheduleId('')
  }

  async function submit() {
    if (!requesterId) { setErr('เลือกผู้เบิก'); return }
    const q = parseInt(qty)
    if (!qty || q <= 0) { setErr('กรอกจำนวน'); return }
    if (mode === 'PLANNED' && !scheduleId) { setErr('เลือกแผนที่จะเบิก'); return }
    if (mode === 'BREAKDOWN' && !analyzerId && !siteId) { setErr('เลือกเครื่องหรือไซต์ที่ชำรุด'); return }
    setSubmitting(true); setErr('')
    const body: Record<string, unknown> = {
      ...extraBody,
      requesterId, qty: q,
      quoteNo: quoteNo || undefined, note: note || undefined,
      replaceType: mode,
      analyzerId: analyzerId || undefined,
      siteId: siteId || undefined,
    }
    if (mode === 'PLANNED') body.scheduleId = scheduleId
    else if (mode === 'BREAKDOWN') body.scheduleId = scheduleId || undefined
    else body.manualSite = manualSite || undefined

    const r = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) },
      body: JSON.stringify(body),
    })
    setSubmitting(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'ส่งคำขอไม่สำเร็จ'); return }
    onDone({ qty: q })
  }

  const modeBtn = (m: ReplaceType, label: string) => (
    <button type="button" onClick={() => switchMode(m)}
      className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${mode === m ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 text-slate-500'}`}>
      {label}
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {modeBtn('PLANNED', 'ตามแผน')}
        {modeBtn('BREAKDOWN', 'ชำรุดก่อนกำหนด')}
        {modeBtn('OTHER', 'นอกแผน')}
      </div>

      {mode === 'PLANNED' && (
        <div>
          <label className={lbl}>เลือกแผนที่จะเบิก *</label>
          {plannedOptions.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400">ไม่มีแผนที่ถึง/เลยกำหนดสำหรับอะไหล่นี้</p>
          ) : (
            <div className="space-y-1.5">
              {plannedOptions.map(s => (
                <label key={s.id} className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm ${scheduleId === String(s.id) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="scheduleId" checked={scheduleId === String(s.id)} onChange={() => pickSchedule(String(s.id))} />
                    <span className="text-slate-700">{s.analyzer?.tag ?? (s.site ? `${s.site.code} (ใช้ร่วม)` : '—')}</span>
                  </span>
                  <span className={s.overdue ? 'text-xs font-semibold text-red-600' : 'text-xs text-slate-400'}>
                    {fmtDue(s.nextDueDate)}{s.overdue ? ' · เลยกำหนด' : ''}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'BREAKDOWN' && (
        <div>
          <label className={lbl}>เครื่อง/ไซต์ที่ชำรุด *</label>
          <div className="mb-1.5 flex gap-1">
            {(['analyzer', 'site'] as const).map(t => (
              <button key={t} type="button" onClick={() => setBreakdownTarget(t)}
                className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium ${breakdownTarget === t ? 'border-slate-600 bg-slate-700 text-white' : 'border-slate-200 text-slate-600'}`}>
                {t === 'analyzer' ? 'เครื่อง (Analyzer)' : 'ไซต์ (ใช้ร่วม)'}
              </button>
            ))}
          </div>
          {breakdownTarget === 'analyzer' ? (
            <select value={analyzerId} onChange={e => pickBreakdownAnalyzer(e.target.value)} className={inp}>
              <option value="">— เลือกเครื่อง —</option>
              {anOpts.map(a => <option key={a.id} value={a.id}>{a.tag}</option>)}
            </select>
          ) : (
            <select value={siteId} onChange={e => pickBreakdownSite(e.target.value)} className={inp}>
              <option value="">— เลือกไซต์ —</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
            </select>
          )}
          {scheduleId && <p className="mt-1 text-xs text-emerald-600">✓ พบแผนของรายการนี้ — จะรีเซ็ตรอบเมื่ออนุมัติ</p>}
          {!scheduleId && (analyzerId || siteId) && <p className="mt-1 text-xs text-slate-400">ไม่มีแผนผูกกับรายการนี้ — ตัด stock อย่างเดียว</p>}
        </div>
      )}

      {mode === 'OTHER' && (
        <div>
          <label className={lbl}>ไซต์ที่นำไปใช้</label>
          <select value={siteId} onChange={e => { setSiteId(e.target.value); if (e.target.value) setManualSite('') }} className={inp}>
            <option value="">— เลือกไซต์ —</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
          </select>
          <input value={manualSite} onChange={e => { setManualSite(e.target.value); if (e.target.value) setSiteId('') }} placeholder="หรือพิมพ์ชื่อไซต์นอกฐานข้อมูล" className={`${inp} mt-1.5`} />
          <label className={`${lbl} mt-3`}>ใช้กับเครื่อง (Analyzer)</label>
          <select value={analyzerId} onChange={e => setAnalyzerId(e.target.value)} className={inp}>
            <option value="">— ไม่ระบุ —</option>
            {anOpts.map(a => <option key={a.id} value={a.id}>{a.tag}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className={lbl}>ผู้เบิก (พนักงาน) *</label>
        <select value={requesterId} onChange={e => setRequesterId(e.target.value)} className={inp}>
          <option value="">— เลือกผู้เบิก —</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.nickname ?? e.fullName}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl}>จำนวนที่เบิก ({part.unit ?? 'หน่วย'}) *</label>
        <input type="number" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} className={inp} />
      </div>
      <div><label className={lbl}>เลขใบเสนอราคา</label><input value={quoteNo} onChange={e => setQuoteNo(e.target.value)} className={inp} placeholder="เช่น QT2026-001" /></div>
      <div><label className={lbl}>หมายเหตุ</label><input value={note} onChange={e => setNote(e.target.value)} className={inp} placeholder="..." /></div>

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      <button onClick={submit} disabled={submitting} className="w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
        {submitting ? 'กำลังส่ง...' : 'ส่งคำขอเบิก'}
      </button>
      <p className="text-center text-[11px] text-slate-400">คำขอจะรอ CEMS Admin อนุมัติก่อนตัด stock</p>
    </div>
  )
}

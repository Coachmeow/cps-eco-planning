'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { Btn, Input, Modal, CustomSelect, fmtDate } from './ui'
import PartWithdrawForm, { type WithdrawSchedule, type WithdrawEmployee } from './PartWithdrawForm'

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

interface Site { id: number; code: string; name?: string | null }
interface Part { id: number; code: string; name: string; unit?: string | null }
interface Analyzer { id: number; tag: string; currentSite?: { id: number; code: string } | null }
interface Cell { qty: number; state: 'plan' | 'overdue' | 'done' }
interface Row { scheduleId: number; partId: number; partCode: string; partName: string; unit: string | null; target: string; intervalMonths: number | null; qtyPerReplace: number; months: Record<number, Cell>; total: number }
interface Plan {
  year: number
  rows: Row[]
  onCondition: { scheduleId: number; partCode: string; partName: string; target: string; qtyPerReplace: number }[]
  upcoming: { scheduleId: number; partId: number; partCode: string; partName: string; target: string; dueDate: string; overdue: boolean }[]
  shortage: { partId: number; code: string; name: string; unit: string | null; need: number; stock: number; diff: number }[]
}
interface Schedule {
  id: number; partId: number; analyzerId: number | null; siteId: number | null
  mode: string; intervalMonths: number | null; qtyPerReplace: number
  lastReplacedDate: string | null; nextDueDate: string | null; isActive: boolean; notes: string | null
  part: Part; analyzer?: { id: number; tag: string } | null; site?: { id: number; code: string } | null
}

const CELL_CLS: Record<string, string> = {
  plan:    'bg-sky-100 text-sky-700',
  overdue: 'bg-red-100 text-red-600',
  done:    'bg-emerald-100 text-emerald-700',
}

const emptyForm = { partId: '', targetType: 'analyzer' as 'analyzer' | 'site', analyzerId: '', siteId: '', mode: 'TIME_BASE', intervalMonths: '12', qtyPerReplace: '1', lastReplacedDate: '', notes: '' }

interface WithdrawTarget { partId: number; scheduleId: number; analyzerId?: number; siteId?: number }

export default function PartPlanSection() {
  const now = new Date()
  const [sites, setSites] = useState<Site[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [analyzers, setAnalyzers] = useState<Analyzer[]>([])
  const [employees, setEmployees] = useState<WithdrawEmployee[]>([])
  const [withdraw, setWithdraw] = useState<WithdrawTarget | null>(null)
  const [siteId, setSiteId] = useState('')
  const [year, setYear] = useState(now.getFullYear())
  const [plan, setPlan] = useState<Plan | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Schedule | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  // โหมดทุกไซต์: แถวสรุปต่ออะไหล่ กด ▸ กางดูรายไซต์/เครื่อง (key = partId)
  const allSites = siteId === 'all'
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // โหลด master data ครั้งเดียว
  useEffect(() => {
    Promise.all([
      fetch('/api/cems/sites').then(r => r.json()),
      fetch('/api/cems/parts').then(r => r.json()),
      fetch('/api/cems/analyzers').then(r => r.json()),
      fetch('/api/cems/employees').then(r => r.json()),
    ]).then(([s, p, a, e]) => {
      setSites(Array.isArray(s) ? s : [])
      setParts(Array.isArray(p) ? p : [])
      setAnalyzers(Array.isArray(a) ? a : [])
      setEmployees(Array.isArray(e) ? e : [])
      if (Array.isArray(s) && s.length && !siteId) setSiteId(String(s[0].id))
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadPlan = useCallback(async () => {
    setLoading(true)
    try {
      const sq = siteId && siteId !== 'all' ? siteId : ''   // 'all' = ไม่ส่ง siteId → API คืนทุกไซต์
      const [pl, sc] = await Promise.all([
        fetch(`/api/cems/part-schedules/plan?year=${year}${sq ? `&siteId=${sq}` : ''}`).then(r => r.json()),
        fetch(`/api/cems/part-schedules${sq ? `?siteId=${sq}` : ''}`).then(r => r.json()),
      ])
      setPlan(pl); setSchedules(Array.isArray(sc) ? sc : [])
    } catch { /* noop */ }
    setLoading(false)
  }, [siteId, year])

  useEffect(() => { if (siteId) loadPlan() }, [siteId, year, loadPlan])
  useEffect(() => { setExpanded(new Set()) }, [siteId, year])

  function openAdd() { setEditing(null); setForm({ ...emptyForm, siteId }); setModalOpen(true) }
  function openEdit(s: Schedule) {
    setEditing(s)
    setForm({
      partId: String(s.partId),
      targetType: s.analyzerId ? 'analyzer' : 'site',
      analyzerId: s.analyzerId ? String(s.analyzerId) : '',
      siteId: s.siteId ? String(s.siteId) : '',
      mode: s.mode, intervalMonths: s.intervalMonths ? String(s.intervalMonths) : '12',
      qtyPerReplace: String(s.qtyPerReplace),
      lastReplacedDate: s.lastReplacedDate ? s.lastReplacedDate.slice(0, 10) : '',
      notes: s.notes ?? '',
    })
    setModalOpen(true)
  }

  async function save() {
    if (!form.partId) { alert('เลือกอะไหล่'); return }
    if (form.targetType === 'analyzer' && !form.analyzerId) { alert('เลือก analyzer'); return }
    if (form.targetType === 'site' && !form.siteId) { alert('เลือกไซต์'); return }
    if (form.mode === 'TIME_BASE' && !form.intervalMonths) { alert('กรอกรอบ (เดือน)'); return }
    setSaving(true)
    const body = {
      partId: form.partId,
      analyzerId: form.targetType === 'analyzer' ? form.analyzerId : null,
      siteId: form.targetType === 'site' ? form.siteId : null,
      mode: form.mode,
      intervalMonths: form.mode === 'TIME_BASE' ? form.intervalMonths : null,
      qtyPerReplace: form.qtyPerReplace,
      lastReplacedDate: form.lastReplacedDate || null,
      notes: form.notes,
    }
    try {
      const url = editing ? `/api/cems/part-schedules/${editing.id}` : '/api/cems/part-schedules'
      const res = await fetch(url, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { alert((await res.json()).error ?? 'บันทึกไม่สำเร็จ'); setSaving(false); return }
      setModalOpen(false); await loadPlan()
    } finally { setSaving(false) }
  }

  async function del(s: Schedule) {
    if (!confirm(`ลบแผน ${s.part.code} (${s.analyzer?.tag ?? s.site?.code ?? ''}) ?`)) return
    await fetch(`/api/cems/part-schedules/${s.id}`, { method: 'DELETE' })
    await loadPlan()
  }

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]
  const dueScheduleIds = new Set((plan?.upcoming ?? []).map(u => u.scheduleId))

  return (
    <div className="space-y-3.5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">ไซต์</span>
          <CustomSelect className="w-44" value={siteId} onChange={setSiteId}
            options={[{ value: 'all', label: '🌐 ทุกไซต์' }, ...sites.map(s => ({ value: String(s.id), label: `${s.code}${s.name ? ` — ${s.name}` : ''}` }))]} placeholder="เลือกไซต์" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">ปี</span>
          <CustomSelect className="w-24" value={String(year)} onChange={v => setYear(parseInt(v))}
            options={yearOptions.map(y => ({ value: String(y), label: String(y + 543) }))} />
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
          <span className="rounded px-1.5 py-0.5 bg-sky-100 text-sky-700">ตามแผน</span>
          <span className="rounded px-1.5 py-0.5 bg-red-100 text-red-600">เลยกำหนด</span>
          <span className="rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700">เปลี่ยนแล้ว</span>
        </div>
        <Btn small onClick={openAdd}>+ เพิ่มแผน</Btn>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด...</div>
      ) : !plan ? null : (
        <>
          {/* Year grid */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-xs" style={{ minWidth: 720 }}>
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 z-10 min-w-[150px] bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">อะไหล่ · รอบ</th>
                  {THAI_MONTHS.map(m => <th key={m} className="w-[40px] px-1 py-2 font-medium text-slate-400">{m}</th>)}
                  <th className="w-[46px] px-2 py-2 font-semibold text-slate-600">รวม</th>
                  <th className="w-[70px] px-2 py-2 font-semibold text-slate-600"></th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.length === 0 && (
                  <tr><td colSpan={15} className="px-3 py-6 text-center text-slate-300">{allSites ? 'ยังไม่มีแผน Time-base' : 'ยังไม่มีแผน Time-base ของไซต์นี้'}</td></tr>
                )}
                {!allSites && plan.rows.map(r => (
                  <tr key={r.scheduleId} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                      <div className="font-medium text-slate-700">{r.partCode} <span className="text-slate-400">· {r.target}</span></div>
                      <div className="text-[10px] text-slate-400">{r.partName}{r.intervalMonths ? ` · ทุก ${r.intervalMonths} เดือน` : ''}</div>
                    </td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                      const c = r.months[m]
                      return <td key={m} className="px-1 py-1.5 text-center">
                        {c && <span className={`inline-block min-w-[22px] rounded px-1 py-0.5 font-semibold ${CELL_CLS[c.state]}`}>{c.qty}</span>}
                      </td>
                    })}
                    <td className="px-2 text-center font-semibold text-slate-600">{r.total || '—'}</td>
                    <td className="px-2 text-center">
                      {dueScheduleIds.has(r.scheduleId) && (
                        <Btn small onClick={() => setWithdraw({ partId: r.partId, scheduleId: r.scheduleId })}>เบิก</Btn>
                      )}
                    </td>
                  </tr>
                ))}
                {allSites && (() => {
                  // จัดกลุ่มตามอะไหล่: แถวสรุป (รวม qty ต่อเดือน) + แถวลูกเมื่อ expand
                  const groups = new Map<number, { partCode: string; partName: string; items: Row[] }>()
                  for (const r of plan.rows) {
                    if (!groups.has(r.partId)) groups.set(r.partId, { partCode: r.partCode, partName: r.partName, items: [] })
                    groups.get(r.partId)!.items.push(r)
                  }
                  const rank: Record<string, number> = { overdue: 3, plan: 2, done: 1 }
                  return [...groups.entries()].sort((a, b) => a[1].partCode.localeCompare(b[1].partCode)).map(([partId, g]) => {
                    const open = expanded.has(partId)
                    const sum: Record<number, Cell> = {}
                    let total = 0
                    for (const r of g.items) {
                      total += r.total
                      for (const [mStr, c] of Object.entries(r.months)) {
                        const m = Number(mStr)
                        const cur = sum[m]
                        sum[m] = { qty: (cur?.qty ?? 0) + c.qty, state: !cur || rank[c.state] > rank[cur.state] ? c.state : cur.state }
                      }
                    }
                    return (
                      <Fragment key={partId}>
                        <tr className="border-t border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                          onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(partId) ? n.delete(partId) : n.add(partId); return n })}>
                          <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                            <div className="flex items-center gap-1.5 font-medium text-slate-700">
                              <span className={`text-[9px] text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                              {g.partCode}
                              <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-normal text-slate-500">{g.items.length} แผน</span>
                            </div>
                            <div className="pl-4 text-[10px] text-slate-400">{g.partName}</div>
                          </td>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                            const c = sum[m]
                            return <td key={m} className="px-1 py-1.5 text-center">
                              {c && <span className={`inline-block min-w-[22px] rounded px-1 py-0.5 font-semibold ${CELL_CLS[c.state]}`}>{c.qty}</span>}
                            </td>
                          })}
                          <td className="px-2 text-center font-semibold text-slate-600">{total || '—'}</td>
                          <td></td>
                        </tr>
                        {open && g.items.map(r => (
                          <tr key={r.scheduleId} className="border-t border-slate-50 bg-slate-50/50">
                            <td className="sticky left-0 z-10 bg-slate-50 px-3 py-1">
                              <div className="pl-4 text-[11px] text-slate-600">{r.target}</div>
                              <div className="pl-4 text-[10px] text-slate-400">{r.intervalMonths ? `ทุก ${r.intervalMonths} เดือน` : ''}</div>
                            </td>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                              const c = r.months[m]
                              return <td key={m} className="px-1 py-1 text-center">
                                {c && <span className={`inline-block min-w-[20px] rounded px-1 text-[11px] font-medium ${CELL_CLS[c.state]}`}>{c.qty}</span>}
                              </td>
                            })}
                            <td className="px-2 text-center text-[11px] font-medium text-slate-500">{r.total || '—'}</td>
                            <td className="px-2 text-center">
                              {dueScheduleIds.has(r.scheduleId) && (
                                <Btn small onClick={() => setWithdraw({ partId: r.partId, scheduleId: r.scheduleId })}>เบิก</Btn>
                              )}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>

          {/* ON_CONDITION group */}
          {plan.onCondition.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">🔧 เปลี่ยนเมื่อชำรุด (ไม่มีรอบ)</p>
              <div className="flex flex-wrap gap-1.5">
                {plan.onCondition.map(o => (
                  <span key={o.scheduleId} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">{o.partCode} · {o.target}</span>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2.5 md:grid-cols-2">
            {/* Shortage forecast */}
            <div className="rounded-lg border border-slate-200 p-2.5">
              <p className="mb-1.5 text-[11px] font-semibold text-slate-600">⚠️ พอ/ขาดสต็อก (รวมทุกไซต์ทั้งปี)</p>
              {plan.shortage.length === 0 ? <p className="text-[11px] text-slate-300">ยังไม่มีแผน</p> : (
                <div className="space-y-1">
                  {plan.shortage.map(p => {
                    const ok = p.diff >= 0
                    return (
                      <div key={p.partId} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1">
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-medium text-slate-700">{p.code} <span className="text-slate-400">{p.name}</span></div>
                          <div className="text-[10px] text-slate-400">ต้องใช้ {p.need} · คงคลัง {p.stock}</div>
                        </div>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                          {ok ? `พอ +${p.diff}` : `ขาด ${Math.abs(p.diff)}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Upcoming / overdue */}
            <div className="rounded-lg border border-slate-200 p-2.5">
              <p className="mb-1.5 text-[11px] font-semibold text-slate-600">🔔 ใกล้/เลยกำหนด (เดือนนี้)</p>
              {plan.upcoming.length === 0 ? <p className="text-[11px] text-slate-300">ไม่มีรายการ</p> : (
                <div className="space-y-1">
                  {plan.upcoming.map(u => (
                    <div key={u.scheduleId} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-slate-700">{u.partCode} <span className="text-slate-400">· {u.target}</span></span>
                      <span className="flex items-center gap-1.5">
                        <span className={u.overdue ? 'font-semibold text-red-600' : 'text-slate-500'}>{fmtDate(u.dueDate)}{u.overdue && ' · เลยกำหนด'}</span>
                        <Btn small onClick={() => setWithdraw({ partId: u.partId, scheduleId: u.scheduleId })}>เบิกตามแผน</Btn>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* จัดการแผน */}
          <div className="rounded-lg border border-slate-200 p-2.5">
            <p className="mb-1.5 text-[11px] font-semibold text-slate-600">📋 แผนรอบเปลี่ยน{allSites ? '' : 'ของไซต์นี้'}</p>
            {schedules.length === 0 ? <p className="text-[11px] text-slate-300">ยังไม่มีแผน — กด “+ เพิ่มแผน”</p> : (
              <div className="divide-y divide-slate-100">
                {schedules.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-2 py-1 text-[11px]">
                    <div className="min-w-0">
                      <span className="font-medium text-slate-700">{s.part.code}</span>
                      <span className="text-slate-400"> · {s.analyzer?.tag ?? (s.site ? `${s.site.code} (ใช้ร่วม)` : '—')}</span>
                      <span className="ml-1.5 text-[10px] text-slate-400">
                        {s.mode === 'TIME_BASE' ? `ทุก ${s.intervalMonths} เดือน · ครั้งละ ${s.qtyPerReplace}` : 'เปลี่ยนเมื่อชำรุด'}
                        {s.lastReplacedDate && ` · ล่าสุด ${fmtDate(s.lastReplacedDate)}`}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <Btn small variant="ghost" onClick={() => openEdit(s)}>แก้</Btn>
                      <Btn small variant="danger" onClick={() => del(s)}>ลบ</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {modalOpen && (
        <Modal title={editing ? 'แก้ไขแผนรอบเปลี่ยน' : 'เพิ่มแผนรอบเปลี่ยน'} onClose={() => setModalOpen(false)}>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">อะไหล่ <span className="text-red-500">*</span></label>
              <CustomSelect value={form.partId} onChange={v => setForm(f => ({ ...f, partId: v }))}
                options={parts.map(p => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))} placeholder="เลือกอะไหล่" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">ผูกกับ <span className="text-red-500">*</span></label>
              <div className="flex gap-1">
                {(['analyzer', 'site'] as const).map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, targetType: t }))}
                    className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium ${form.targetType === t ? 'border-slate-600 bg-slate-700 text-white' : 'border-slate-200 text-slate-600'}`}>
                    {t === 'analyzer' ? 'ราย Analyzer' : 'รายไซต์ (ใช้ร่วม)'}
                  </button>
                ))}
              </div>
              {form.targetType === 'analyzer'
                ? <CustomSelect value={form.analyzerId} onChange={v => setForm(f => ({ ...f, analyzerId: v }))}
                    options={analyzers.map(a => ({ value: String(a.id), label: `${a.tag}${a.currentSite ? ` · ${a.currentSite.code}` : ''}` }))} placeholder="เลือกเครื่อง" />
                : <CustomSelect value={form.siteId} onChange={v => setForm(f => ({ ...f, siteId: v }))}
                    options={sites.map(s => ({ value: String(s.id), label: `${s.code}${s.name ? ` — ${s.name}` : ''}` }))} placeholder="เลือกไซต์" />}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">ประเภทรอบ</label>
              <div className="flex gap-1">
                {([['TIME_BASE', 'Time-base (ทุก N เดือน)'], ['ON_CONDITION', 'เปลี่ยนเมื่อชำรุด']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setForm(f => ({ ...f, mode: v }))}
                    className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium ${form.mode === v ? 'border-slate-600 bg-slate-700 text-white' : 'border-slate-200 text-slate-600'}`}>{l}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {form.mode === 'TIME_BASE' && (
                <Input label="รอบ (เดือน)" type="number" required value={form.intervalMonths} onChange={v => setForm(f => ({ ...f, intervalMonths: v }))} placeholder="12" />
              )}
              <Input label="จำนวนต่อครั้ง" type="number" value={form.qtyPerReplace} onChange={v => setForm(f => ({ ...f, qtyPerReplace: v }))} placeholder="1" />
            </div>

            <Input label="วันเปลี่ยนล่าสุด (คำนวณรอบถัดไป)" type="date" value={form.lastReplacedDate} onChange={v => setForm(f => ({ ...f, lastReplacedDate: v }))} />
            <Input label="หมายเหตุ" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="ถ้ามี" />

            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setModalOpen(false)}>ยกเลิก</Btn>
              <Btn onClick={save}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {withdraw && (
        <WithdrawModal
          target={withdraw}
          parts={parts}
          sites={sites}
          analyzers={analyzers}
          employees={employees}
          onClose={() => setWithdraw(null)}
          onDone={() => { setWithdraw(null); loadPlan() }}
        />
      )}
    </div>
  )
}

function WithdrawModal({ target, parts, sites, analyzers, employees, onClose, onDone }: {
  target: WithdrawTarget; parts: Part[]; sites: Site[]; analyzers: Analyzer[]; employees: WithdrawEmployee[]
  onClose: () => void; onDone: () => void
}) {
  const [schedules, setSchedules] = useState<WithdrawSchedule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/cems/part-schedules/for-part?partId=${target.partId}`)
      .then(r => r.json()).then(d => setSchedules(Array.isArray(d) ? d : []))
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false))
  }, [target.partId])

  const part = parts.find(p => p.id === target.partId)
  if (!part) return null

  return (
    <Modal title={`เบิกอะไหล่ · ${part.code}`} onClose={onClose}>
      {loading ? <p className="py-4 text-center text-sm text-slate-400">กำลังโหลด...</p> : (
        <PartWithdrawForm
          part={part}
          employees={employees}
          sites={sites.map(s => ({ id: s.id, code: s.code }))}
          analyzers={analyzers.map(a => ({ id: a.id, tag: a.tag, currentSiteId: a.currentSite?.id ?? null }))}
          schedules={schedules}
          submitUrl="/api/cems/part-requests"
          extraBody={{ partId: target.partId }}
          prefill={{ mode: 'PLANNED', scheduleId: target.scheduleId, analyzerId: target.analyzerId, siteId: target.siteId }}
          onDone={onDone}
        />
      )}
    </Modal>
  )
}

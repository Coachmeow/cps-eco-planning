'use client'

import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Btn, Input, Modal, CustomSelect, fmtDate, ageText } from '@/components/cems/ui'

interface Comp { id?: number; gas: string; concentration: number | string; unit: string }
interface GasRow {
  id: number; cylinderNo: string; brand: string | null; size: string | null; originCountry: string | null
  initialPressure: number; currentPressure: number; lowThreshold: number | null; initialWeight: number | null
  receivedDate: string | null; expiryDate: string | null; location: string | null
  dealerDate: string | null; returnDueDate: string | null
  returnedDate: string | null; returnedBy: string | null
  status: 'ACTIVE' | 'EMPTY' | 'RETURNED'; notes: string | null
  components: Comp[]; pct: number; kgRemaining: number | null
  lastUse: { purpose: string | null; usageLocation: string | null; readingDate: string } | null
}
interface ReadingRow { id: number; pressure: number; readingDate: string; reader: string | null; purpose: string | null; usageLocation: string | null; notes: string | null }

const GAS_STATUS: Record<string, { label: string; chip: string }> = {
  ACTIVE:   { label: 'ใช้งานได้', chip: 'bg-emerald-100 text-emerald-700' },
  EMPTY:    { label: 'หมด',       chip: 'bg-slate-200 text-slate-500' },
  RETURNED: { label: 'ส่งคืน',    chip: 'bg-sky-100 text-sky-700' },
}
const COMMON_GASES = ['SO2', 'NO', 'NO2', 'NOx', 'CO', 'CO2', 'O2', 'N2', 'CH4', 'H2S', 'HCl', 'NH3', 'THC']
const GAS_UNITS = ['ppm', '%', 'mg/m³', 'vol%']
const todayKey = () => new Date().toLocaleDateString('en-CA')

const compText = (c: Comp) => `${c.gas} ${c.concentration}${c.unit === '%' || c.unit === 'vol%' ? c.unit : ' ' + c.unit}`
const barColor = (pct: number, low: boolean) => low || pct < 20 ? 'bg-red-500' : pct < 50 ? 'bg-amber-400' : 'bg-emerald-500'

// วันหมดอายุ → ข้อความ/สีเตือน
function expiryInfo(expiry: string | null): { text: string; cls: string } | null {
  if (!expiry) return null
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { text: `หมดอายุแล้ว (${fmtDate(expiry)})`, cls: 'text-red-600 font-semibold' }
  if (days <= 60) return { text: `ใกล้หมดอายุ ${fmtDate(expiry)}`, cls: 'text-amber-600' }
  return { text: fmtDate(expiry), cls: 'text-slate-400' }
}

// กำหนดส่งคืนถัง → นับวันถอยหลัง (เกินแล้วเสียค่าเช่า) ; ส่งคืนแล้ว = โชว์วันที่/ผู้ส่งคืน
function returnInfo(c: Pick<GasRow, 'returnDueDate' | 'status' | 'returnedDate' | 'returnedBy'>): { text: string; sub: string; cls: string } | null {
  if (c.status === 'RETURNED') {
    const day = c.returnedDate ?? c.returnDueDate
    if (!day && !c.returnedBy) return { text: 'ส่งคืนแล้ว', sub: '', cls: 'text-sky-600' }
    return { text: 'ส่งคืนแล้ว', sub: `${day ? fmtDate(day) : ''}${c.returnedBy ? ` · ${c.returnedBy}` : ''}`, cls: 'text-sky-600' }
  }
  if (!c.returnDueDate) return null
  const days = Math.ceil((new Date(c.returnDueDate).getTime() - Date.now()) / 86_400_000)
  if (days < 0)  return { text: `เลยกำหนด ${-days} วัน`, sub: fmtDate(c.returnDueDate), cls: 'text-red-600 font-semibold' }
  if (days <= 30) return { text: `อีก ${days} วัน`,       sub: fmtDate(c.returnDueDate), cls: 'text-amber-600 font-semibold' }
  return { text: `อีก ${days} วัน`, sub: fmtDate(c.returnDueDate), cls: 'text-slate-500' }
}

export default function GasSection({ canManage = false }: { canManage?: boolean }) {
  const [rows, setRows] = useState<GasRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [editRow, setEditRow] = useState<GasRow | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [readingRow, setReadingRow] = useState<GasRow | null>(null)
  const [historyRow, setHistoryRow] = useState<GasRow | null>(null)
  const [qrRow, setQrRow] = useState<GasRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/cems/gas')
    if (r.ok) setRows(await r.json())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function delRow(c: GasRow) {
    if (!confirm(`ลบถัง "${c.cylinderNo}" ?\nองค์ประกอบและประวัติการอ่านความดันทั้งหมดจะถูกลบด้วย`)) return
    const r = await fetch(`/api/cems/gas/${c.id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? 'ลบไม่สำเร็จ'); return }
    load()
  }

  const filtered = rows.filter(c => {
    if (statusFilter && c.status !== statusFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    const hay = `${c.cylinderNo} ${c.brand ?? ''} ${c.location ?? ''} ${c.components.map(x => x.gas).join(' ')} ${c.lastUse?.purpose ?? ''} ${c.lastUse?.usageLocation ?? ''}`.toLowerCase()
    return hay.includes(q)
  })

  const active = rows.filter(c => c.status === 'ACTIVE')
  const nearEmpty = active.filter(c => c.lowThreshold != null ? c.currentPressure <= c.lowThreshold : c.pct < 20).length
  const emptyCount = rows.filter(c => c.status === 'EMPTY').length

  return (
    <div>
      {/* summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card n={rows.length} label="ถังทั้งหมด" tone="slate" />
        <Card n={active.length} label="ใช้งานได้" tone="emerald" />
        <Card n={nearEmpty || '—'} label="ใกล้หมด" tone={nearEmpty ? 'red' : 'slate'} />
        <Card n={emptyCount || '—'} label="หมดแล้ว" tone="slate" />
      </div>

      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ค้นหาเลขถัง / ยี่ห้อ / ชนิดแก๊ส (เช่น SO2)..."
          className="w-72 rounded border border-slate-300 px-3 py-1.5 text-sm focus:outline-none" />
        <CustomSelect value={statusFilter} onChange={setStatusFilter} placeholder="ทุกสถานะ" className="w-36"
          options={[{ value: '', label: 'ทุกสถานะ' }, ...Object.entries(GAS_STATUS).map(([v, m]) => ({ value: v, label: m.label }))]} />
        <p className="text-sm text-slate-400">{filtered.length} ถัง</p>
        {canManage && (
          <div className="ml-auto">
            <Btn onClick={() => { setEditRow(null); setAddOpen(true) }}>+ เพิ่มถังแก๊ส</Btn>
          </div>
        )}
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>
            <th className="px-3 py-2 text-left font-medium">เลขถัง</th>
            <th className="px-3 py-2 text-left font-medium">องค์ประกอบ</th>
            <th className="px-3 py-2 text-left font-medium">คงเหลือ (psi)</th>
            <th className="px-3 py-2 text-right font-medium">kg</th>
            <th className="px-3 py-2 text-left font-medium">อายุ / หมดอายุ</th>
            <th className="px-3 py-2 text-left font-medium">ส่งคืนภายใน</th>
            <th className="px-3 py-2 text-left font-medium">ที่เก็บ/ไซต์</th>
            <th className="px-3 py-2 text-left font-medium">ใช้งานล่าสุด</th>
            <th className="px-3 py-2 text-center font-medium">สถานะ</th>
            <th className="px-3 py-2" />
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="px-3 py-8 text-center text-sm text-slate-300">กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-sm text-slate-300">
              {rows.length === 0 ? 'ยังไม่มีถังแก๊ส — กด "+ เพิ่มถังแก๊ส"' : 'ไม่พบถังตามเงื่อนไข'}
            </td></tr>}
            {filtered.map(c => {
              const low = c.lowThreshold != null ? c.currentPressure <= c.lowThreshold : c.pct < 20
              const exp = expiryInfo(c.expiryDate)
              return (
                <tr key={c.id} className={`border-t border-slate-100 hover:bg-slate-50 ${c.status !== 'ACTIVE' ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2 align-top">
                    <p className="font-mono text-xs font-semibold text-slate-700">{c.cylinderNo}</p>
                    <p className="text-[11px] text-slate-400">{[c.brand, c.size, c.originCountry].filter(Boolean).join(' · ') || '—'}</p>
                  </td>
                  <td className="max-w-[220px] px-3 py-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      {c.components.length === 0 ? <span className="text-xs text-slate-300">—</span>
                        : c.components.map((x, i) => <span key={i} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">{compText(x)}</span>)}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full ${barColor(c.pct, low)}`} style={{ width: `${c.pct}%` }} />
                      </div>
                      <span className={`text-xs font-semibold ${low ? 'text-red-600' : 'text-slate-600'}`}>{c.pct}%</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">{c.currentPressure} / {c.initialPressure} psi{low && ' ⚠ ใกล้หมด'}</p>
                  </td>
                  <td className="px-3 py-2 text-right align-top text-slate-500">{c.kgRemaining != null ? c.kgRemaining : '—'}</td>
                  <td className="px-3 py-2 align-top text-xs">
                    <p className="text-slate-500">{ageText(c.receivedDate)}</p>
                    {exp && <p className={exp.cls}>{exp.text}</p>}
                  </td>
                  <td className="px-3 py-2 align-top text-xs">
                    {(() => {
                      const r = returnInfo(c)
                      return r
                        ? <><p className={r.cls}>{r.text}</p><p className="text-[10px] text-slate-300">{r.sub}</p></>
                        : <span className="text-slate-300">—</span>
                    })()}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-slate-500">{c.location || <span className="text-slate-300">—</span>}</td>
                  <td className="max-w-[180px] px-3 py-2 align-top text-xs">
                    {c.lastUse && (c.lastUse.purpose || c.lastUse.usageLocation) ? (
                      <>
                        {c.lastUse.purpose && <p className="text-slate-600">🎯 {c.lastUse.purpose}</p>}
                        {c.lastUse.usageLocation && <p className="text-slate-500">📍 {c.lastUse.usageLocation}</p>}
                        <p className="text-[10px] text-slate-300">{fmtDate(c.lastUse.readingDate)}</p>
                      </>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center align-top">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${GAS_STATUS[c.status].chip}`}>{GAS_STATUS[c.status].label}</span>
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    <div className="flex items-center justify-end gap-1">
                      <Btn small onClick={() => setReadingRow(c)}>📊 อัปเดต</Btn>
                      <span className="mx-0.5 h-4 w-px bg-slate-200" />
                      <Btn small variant="ghost" onClick={() => setQrRow(c)}>QR</Btn>
                      <Btn small variant="ghost" onClick={() => setHistoryRow(c)}>ประวัติ</Btn>
                      {canManage && <>
                        <span className="mx-0.5 h-4 w-px bg-slate-200" />
                        <Btn small variant="ghost" onClick={() => { setEditRow(c); setAddOpen(true) }}>แก้</Btn>
                        <Btn small variant="danger" onClick={() => delRow(c)}>ลบ</Btn>
                      </>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {addOpen && <CylinderModal row={editRow} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load() }} />}
      {readingRow && <ReadingModal row={readingRow} onClose={() => setReadingRow(null)} onSaved={() => { setReadingRow(null); load() }} />}
      {historyRow && <HistoryModal row={historyRow} onClose={() => setHistoryRow(null)} />}
      {qrRow && <QrModal row={qrRow} onClose={() => setQrRow(null)} />}
    </div>
  )
}

function Card({ n, label, tone }: { n: number | string; label: string; tone: 'slate' | 'emerald' | 'red' | 'sky' }) {
  const bg = { slate: 'bg-slate-50', emerald: 'bg-emerald-50', red: 'bg-red-50', sky: 'bg-sky-50' }[tone]
  const fg = { slate: 'text-slate-700', emerald: 'text-emerald-700', red: 'text-red-600', sky: 'text-sky-700' }[tone]
  return (
    <div className={`rounded-lg px-3 py-2.5 text-center ${bg}`}>
      <p className={`text-lg font-bold ${fg}`}>{n}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  )
}

// ── Modal: เพิ่ม/แก้ไขถัง + องค์ประกอบ ─────────────────────────
function CylinderModal({ row, onClose, onSaved }: { row: GasRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    cylinderNo: row?.cylinderNo ?? '', brand: row?.brand ?? '', size: row?.size ?? '',
    initialPressure: row ? String(row.initialPressure) : '2000',
    currentPressure: row ? String(row.currentPressure) : '',
    lowThreshold: row?.lowThreshold != null ? String(row.lowThreshold) : '150',
    initialWeight: row?.initialWeight != null ? String(row.initialWeight) : '',
    receivedDate: row?.receivedDate ? row.receivedDate.slice(0, 10) : '',
    expiryDate: row?.expiryDate ? row.expiryDate.slice(0, 10) : '',
    dealerDate: row?.dealerDate ? row.dealerDate.slice(0, 10) : todayKey(),
    returnDueDate: row?.returnDueDate ? row.returnDueDate.slice(0, 10) : '',
    location: row?.location ?? '', notes: row?.notes ?? '',
    status: row?.status ?? 'ACTIVE',
  })
  const [comps, setComps] = useState<Comp[]>(row?.components.map(c => ({ gas: c.gas, concentration: c.concentration, unit: c.unit })) ?? [{ gas: '', concentration: '', unit: 'ppm' }])
  // ประเทศผู้ผลิต — ไทย/อเมริกา = ค่าคงที่ ; อื่นๆ = พิมพ์เอง
  const initCountry = row?.originCountry ?? ''
  const [countryOpt, setCountryOpt] = useState(initCountry === 'ไทย' || initCountry === 'อเมริกา' ? initCountry : initCountry ? 'อื่นๆ' : '')
  const [countryOther, setCountryOther] = useState(initCountry === 'ไทย' || initCountry === 'อเมริกา' ? '' : initCountry)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }))
  const setComp = (i: number, k: keyof Comp, v: string) => setComps(cs => cs.map((c, j) => j === i ? { ...c, [k]: v } : c))

  async function save() {
    if (!form.cylinderNo.trim()) { setErr('กรอกเลขถัง'); return }
    if (!form.initialPressure || parseFloat(form.initialPressure) <= 0) { setErr('กรอกความดันเต็มถัง (psi)'); return }
    const cleanComps = comps.filter(c => c.gas.trim() && c.concentration !== '')
    const originCountry = countryOpt === 'อื่นๆ' ? countryOther.trim() : countryOpt
    setSaving(true); setErr('')
    const body = { ...form, originCountry, components: cleanComps }
    const r = row
      ? await fetch(`/api/cems/gas/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/cems/gas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'บันทึกไม่สำเร็จ'); return }
    onSaved()
  }

  return (
    <Modal title={row ? `แก้ไข — ${row.cylinderNo}` : '+ เพิ่มถังแก๊สมาตรฐาน'} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Input label="เลขถัง" value={form.cylinderNo} onChange={f('cylinderNo')} placeholder="เช่น CYL-001" required />
          <Input label="ยี่ห้อ/ซัพพลายเออร์" value={form.brand} onChange={f('brand')} placeholder="Linde / BIG / Praxair" />
          <Input label="ขนาดถัง" value={form.size} onChange={f('size')} placeholder="47L / 10L" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">ประเทศผู้ผลิต</label>
            <CustomSelect value={countryOpt} onChange={setCountryOpt} placeholder="— เลือก —"
              options={[{ value: '', label: '— ไม่ระบุ —' }, { value: 'ไทย', label: 'ไทย' }, { value: 'อเมริกา', label: 'อเมริกา' }, { value: 'อื่นๆ', label: 'อื่นๆ (พิมพ์เอง)' }]} />
          </div>
          {countryOpt === 'อื่นๆ' && (
            <Input label="ระบุประเทศ" value={countryOther} onChange={setCountryOther} placeholder="เช่น เยอรมนี, ญี่ปุ่น" />
          )}
        </div>

        {/* องค์ประกอบแก๊ส */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-600">องค์ประกอบแก๊ส (หลายชนิดต่อถังได้)</label>
            <button type="button" onClick={() => setComps(cs => [...cs, { gas: '', concentration: '', unit: 'ppm' }])}
              className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-300">+ เพิ่มแก๊ส</button>
          </div>
          <datalist id="common-gases">{COMMON_GASES.map(g => <option key={g} value={g} />)}</datalist>
          <div className="space-y-1.5">
            {comps.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input list="common-gases" value={c.gas} onChange={e => setComp(i, 'gas', e.target.value)} placeholder="ชนิด (SO2)"
                  className="w-28 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300" />
                <input value={String(c.concentration)} onChange={e => setComp(i, 'concentration', e.target.value)} placeholder="ค่า" type="number"
                  className="w-24 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300" />
                <select value={c.unit} onChange={e => setComp(i, 'unit', e.target.value)}
                  className="w-24 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300">
                  {GAS_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <button type="button" onClick={() => setComps(cs => cs.length > 1 ? cs.filter((_, j) => j !== i) : cs)}
                  className="px-1.5 text-slate-300 hover:text-red-500">×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input label="ความดันเต็มถัง (psi)" value={form.initialPressure} onChange={f('initialPressure')} type="number" required />
          <Input label={row ? 'ความดันปัจจุบัน (psi)' : 'ความดันเริ่ม (ว่าง=เต็ม)'} value={form.currentPressure} onChange={f('currentPressure')} type="number" placeholder={form.initialPressure} />
          <Input label="เกณฑ์เตือนใกล้หมด (psi)" value={form.lowThreshold} onChange={f('lowThreshold')} type="number" />
          <Input label="น้ำหนักแก๊สเต็ม (kg)" value={form.initialWeight} onChange={f('initialWeight')} type="number" placeholder="ไว้คำนวณ kg" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input label="วันที่ผลิต" value={form.receivedDate} onChange={f('receivedDate')} type="date" />
          <Input label="วันหมดอายุแก๊ส" value={form.expiryDate} onChange={f('expiryDate')} type="date" />
          <Input label="วันที่รับจาก Dealer" value={form.dealerDate} onChange={f('dealerDate')} type="date" />
          <Input label="ต้องส่งคืนภายใน" value={form.returnDueDate} onChange={f('returnDueDate')} type="date" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input label="ที่เก็บ/ไซต์" value={form.location} onChange={f('location')} placeholder="คลัง / SKK3" />
          {row && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">สถานะ</label>
              <CustomSelect value={form.status} onChange={v => setForm(p => ({ ...p, status: v as GasRow['status'] }))}
                options={Object.entries(GAS_STATUS).map(([v, m]) => ({ value: v, label: m.label }))} />
            </div>
          )}
        </div>
        <Input label="หมายเหตุ" value={form.notes} onChange={f('notes')} />

        {err && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>ยกเลิก</Btn>
          <Btn onClick={save}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ── Modal: อัปเดตความดัน ─────────────────────────────────────
function ReadingModal({ row, onClose, onSaved }: { row: GasRow; onClose: () => void; onSaved: () => void }) {
  const [pressure, setPressure] = useState('')
  const [reader, setReader] = useState('')
  const [purpose, setPurpose] = useState('')
  const [usageLocation, setUsageLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(todayKey())
  const [markReturned, setMarkReturned] = useState(false)
  const [returnedBy, setReturnedBy] = useState('')
  const [returnedDate, setReturnedDate] = useState(todayKey())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const p = parseFloat(pressure)
  const hasPressure = pressure.trim() !== ''
  const preview = !isNaN(p) && row.initialPressure > 0 ? Math.max(0, Math.min(100, Math.round((p / row.initialPressure) * 100))) : null
  const willEmpty = !isNaN(p) && row.lowThreshold != null && p <= row.lowThreshold

  async function save() {
    if (!hasPressure && !markReturned) { setErr('กรอกความดัน หรือเลือกส่งคืนท่อ'); return }
    if (hasPressure && (isNaN(p) || p < 0)) { setErr('กรอกความดัน (psi) ให้ถูกต้อง'); return }
    setSaving(true); setErr('')
    const r = await fetch(`/api/cems/gas/${row.id}/readings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pressure: hasPressure ? pressure : undefined,
        reader: reader || undefined, purpose: purpose || undefined, usageLocation: usageLocation || undefined, notes: notes || undefined, readingDate: date,
        markReturned, returnedBy: markReturned ? (returnedBy || undefined) : undefined, returnedDate: markReturned ? returnedDate : undefined,
      }),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'บันทึกไม่สำเร็จ'); return }
    onSaved()
  }

  return (
    <Modal title={`📊 อัปเดตความดัน — ${row.cylinderNo}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {row.components.map(compText).join(' · ') || 'ไม่มีข้อมูลองค์ประกอบ'}<br />
          ปัจจุบัน <b className="text-slate-700">{row.currentPressure} psi</b> ({row.pct}%) จากเต็ม {row.initialPressure} psi
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="ความดันที่อ่านได้ (psi)" value={pressure} onChange={setPressure} type="number" />
          <Input label="วันที่" value={date} onChange={setDate} type="date" />
        </div>
        {preview != null && (
          <p className={`rounded px-3 py-2 text-xs ${willEmpty ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
            คงเหลือหลังบันทึก ≈ <b>{preview}%</b>
            {row.initialWeight != null && <> · {Math.round(row.initialWeight * preview / 100 * 100) / 100} kg</>}
            {willEmpty && ' · ต่ำกว่าเกณฑ์ → จะมาร์คถังหมดอัตโนมัติ'}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="วัตถุประสงค์ใช้งาน" value={purpose} onChange={setPurpose} placeholder="เช่น สอบเทียบ zero/span" />
          <Input label="สถานที่ใช้งาน" value={usageLocation} onChange={setUsageLocation} placeholder="เช่น SKK3 / คลัง" />
        </div>
        <Input label="ผู้อ่าน" value={reader} onChange={setReader} />
        <Input label="หมายเหตุ" value={notes} onChange={setNotes} placeholder="อื่น ๆ" />

        {/* ส่งคืนท่อ — มาร์คสถานะ RETURNED (ล้างสถานะเลยกำหนด) */}
        <div className={`rounded-lg border p-3 ${markReturned ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={markReturned} onChange={e => setMarkReturned(e.target.checked)} className="h-4 w-4" />
            ↩ แจ้งส่งคืนท่อ (เปลี่ยนสถานะเป็น “ส่งคืนแล้ว”)
          </label>
          {markReturned && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Input label="วันที่ส่งคืน" value={returnedDate} onChange={setReturnedDate} type="date" />
              <Input label="ผู้ส่งคืน" value={returnedBy} onChange={setReturnedBy} placeholder="ชื่อผู้ส่งคืน" />
            </div>
          )}
        </div>

        {err && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>ยกเลิก</Btn>
          <Btn onClick={save}>{saving ? 'กำลังบันทึก...' : markReturned ? 'บันทึก + ส่งคืน' : 'บันทึก'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ── Modal: ประวัติการอ่านความดัน ─────────────────────────────
function HistoryModal({ row, onClose }: { row: GasRow; onClose: () => void }) {
  const [readings, setReadings] = useState<ReadingRow[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/cems/gas/${row.id}/readings`)
      if (r.ok) setReadings(await r.json())
      setLoading(false)
    })()
  }, [row.id])

  return (
    <Modal title={`⏱ ประวัติความดัน — ${row.cylinderNo}`} onClose={onClose} wide>
      <p className="mb-3 text-xs text-slate-400">เต็ม {row.initialPressure} psi · ปัจจุบัน {row.currentPressure} psi ({row.pct}%)</p>
      {loading ? <p className="py-6 text-center text-sm text-slate-300">กำลังโหลด...</p>
        : readings.length === 0 ? <p className="py-6 text-center text-sm text-slate-300">ยังไม่มีประวัติ</p>
        : (
        <div className="space-y-1.5">
          {readings.map(rd => {
            const pct = row.initialPressure > 0 ? Math.round((rd.pressure / row.initialPressure) * 100) : 0
            return (
              <div key={rd.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">{rd.pressure} psi</span>
                    <span className="text-slate-400">≈ {pct}%</span>
                  </div>
                  <span className="text-slate-400">{rd.reader && `${rd.reader} · `}{fmtDate(rd.readingDate)}</span>
                </div>
                {(rd.purpose || rd.usageLocation) && (
                  <p className="mt-0.5 text-slate-500">
                    {rd.purpose && <>🎯 {rd.purpose}</>}
                    {rd.purpose && rd.usageLocation && ' · '}
                    {rd.usageLocation && <>📍 {rd.usageLocation}</>}
                  </p>
                )}
                {rd.notes && <p className="mt-0.5 text-slate-400">📝 {rd.notes}</p>}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

// ── Modal: QR ถังแก๊ส ────────────────────────────────────────
function QrModal({ row, onClose }: { row: GasRow; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/cems/gas/${row.id}/qr`)
      if (!r.ok) return
      const { token } = await r.json()
      setQr(await QRCode.toDataURL(`${window.location.origin}/g/${token}`, { width: 320, margin: 2 }))
    })()
  }, [row.id])

  // ดาวน์โหลดเป็นรูปฉลาก: กรอบ + เลขท่อ + องค์ประกอบ + QR (วาดด้วย canvas)
  function download() {
    if (!qr) return
    const W = 440, H = 560, QS = 300
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H)
    // กรอบมุมมน
    ctx.strokeStyle = '#c7d2fe'; ctx.lineWidth = 3
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(14, 14, W - 28, H - 28, 16); ctx.stroke() }
    else ctx.strokeRect(14, 14, W - 28, H - 28)
    ctx.textAlign = 'center'
    const font = (s: number, b = false) => `${b ? 'bold ' : ''}${s}px system-ui, "Segoe UI", "Noto Sans Thai", sans-serif`
    // header
    ctx.fillStyle = '#4f46e5'; ctx.font = font(16, true)
    ctx.fillText('แก๊สมาตรฐาน', W / 2, 50)
    // เลขท่อ (เด่นสุด)
    ctx.fillStyle = '#1e293b'; ctx.font = font(32, true)
    ctx.fillText(row.cylinderNo, W / 2, 92)
    // องค์ประกอบ (ตัดบรรทัดถ้ายาว สูงสุด 2 บรรทัด)
    ctx.fillStyle = '#64748b'; ctx.font = font(14)
    const comp = row.components.map(compText).join(' · ')
    const lines: string[] = []
    if (comp) {
      let cur = ''
      for (const w of comp.split(' ')) {
        const t = cur ? `${cur} ${w}` : w
        if (ctx.measureText(t).width > W - 70 && cur) { lines.push(cur); cur = w } else cur = t
        if (lines.length >= 2) break
      }
      if (cur && lines.length < 2) lines.push(cur)
    }
    lines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, W / 2, 118 + i * 20))
    // QR
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, (W - QS) / 2, 165, QS, QS)
      ctx.fillStyle = '#94a3b8'; ctx.font = font(13)
      ctx.fillText('สแกนเพื่ออัปเดตความดันคงเหลือ', W / 2, 165 + QS + 34)
      const safe = row.cylinderNo.replace(/[\\/:*?"<>|\s]+/g, '')
      const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = `QR_GAS_${safe}.png`; a.click()
    }
    img.src = qr
  }
  function print() {
    if (!qr) return
    const w = window.open('', '_blank', 'width=420,height=620')
    if (!w) { alert('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองใหม่'); return }
    const comp = row.components.map(compText).join(', ')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR ${row.cylinderNo}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box;font-family:system-ui,'Segoe UI',sans-serif}
      body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}
      .tag{font-size:12px;letter-spacing:2px;color:#4f46e5;font-weight:700}.code{font-size:26px;font-weight:800;color:#1e293b;margin:6px 0 2px}
      .name{font-size:13px;color:#64748b;margin-bottom:16px}img{width:300px;height:300px}.foot{font-size:12px;color:#94a3b8;margin-top:14px}</style></head>
      <body><div class="tag">แก๊สมาตรฐาน</div><div class="code">🧪 ${row.cylinderNo}</div>
      <div class="name">${comp || ''}</div>
      <img src="${qr}" alt="QR" /><div class="foot">สแกนเพื่ออัปเดตความดันคงเหลือ</div>
      <script>const i=document.querySelector('img');function g(){window.focus();window.print()}if(i.complete)g();else i.onload=g;window.onafterprint=()=>window.close()<\/script>
      </body></html>`)
    w.document.close()
  }

  return (
    <Modal title={`QR — ${row.cylinderNo}`} onClose={onClose}>
      <div className="text-center">
        <p className="mb-3 text-xs text-slate-400">แขวนที่ถัง สแกนเพื่ออัปเดตความดันคงเหลือ (ไม่ต้องล็อกอิน)</p>
        {qr ? <img src={qr} alt="QR" className="mx-auto h-56 w-56" /> : <p className="py-16 text-sm text-slate-300">กำลังสร้าง QR...</p>}
        <div className="mt-4 flex gap-2">
          <Btn variant="ghost" onClick={onClose}>ปิด</Btn>
          <Btn variant="ghost" onClick={download}>↓ ดาวน์โหลด</Btn>
          <Btn onClick={print}>ปริ้น</Btn>
        </div>
      </div>
    </Modal>
  )
}

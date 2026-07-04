'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Btn, Input, Modal, CustomSelect, fmtDate } from '@/components/cems/ui'

interface PartRow {
  id: number; code: string; name: string; brand: string | null; unit: string | null
  minStock: number; location: string | null; refCost: number | null
  isActive: boolean; notes: string | null
  stock: number; value: number
}
interface TxnRow {
  id: number; type: 'IN' | 'OUT' | 'ADJUST'; qty: number; unitCost: number | null; txnDate: string
  manualSite: string | null; quoteNo: string | null; person: string | null; notes: string | null
  site: { code: string } | null; analyzer: { tag: string } | null
  part?: { code: string; name: string; unit: string | null }
}
interface SiteOpt { id: number; code: string }
interface AnalyzerOpt { id: number; tag: string; currentSiteId: number | null }

const TXN_META: Record<string, { label: string; chip: string }> = {
  IN:     { label: 'รับเข้า', chip: 'bg-emerald-100 text-emerald-700' },
  OUT:    { label: 'เบิกออก', chip: 'bg-amber-100 text-amber-700' },
  ADJUST: { label: 'ปรับยอด', chip: 'bg-slate-200 text-slate-600' },
}
const todayKey = () => new Date().toLocaleDateString('en-CA')
const money = (n: number | null | undefined) => n != null ? n.toLocaleString('th-TH', { maximumFractionDigits: 2 }) : '—'

export default function PartsSection() {
  const [parts, setParts] = useState<PartRow[]>([])
  const [sites, setSites] = useState<SiteOpt[]>([])
  const [analyzers, setAnalyzers] = useState<AnalyzerOpt[]>([])
  const [loading, setLoading] = useState(true)

  // filters
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [belowMinOnly, setBelowMinOnly] = useState(false)

  // modals
  const [txnModal, setTxnModal] = useState<{ part: PartRow; type: 'IN' | 'OUT' } | null>(null)
  const [historyPart, setHistoryPart] = useState<PartRow | null>(null)
  const [editPart, setEditPart] = useState<PartRow | null>(null)   // null+addOpen = เพิ่มใหม่
  const [addOpen, setAddOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [pRes, sRes, aRes] = await Promise.all([
      fetch('/api/cems/parts'), fetch('/api/cems/sites'), fetch('/api/cems/analyzers'),
    ])
    if (pRes.ok) setParts(await pRes.json())
    if (sRes.ok) setSites(await sRes.json())
    if (aRes.ok) setAnalyzers(await aRes.json())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function importFile(file?: File) {
    if (!file) return
    setImporting(true)
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch('/api/cems/parts/import', { method: 'POST', body: fd })
    const d = await r.json().catch(() => ({}))
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
    if (!r.ok) { alert(d.error ?? 'นำเข้าไม่สำเร็จ'); return }
    alert(`นำเข้าสำเร็จ ${d.created} รายการ${d.renamed ? ` (รหัสซ้ำแยกเป็นรายการใหม่ ${d.renamed})` : ''}${(d.report ?? []).length ? '\n' + d.report.join('\n') : ''}`)
    load()
  }

  async function delPart(p: PartRow) {
    if (!confirm(`ลบ "${p.code} — ${p.name}" ?\nประวัติรับเข้า/เบิกออกทั้งหมดจะถูกลบด้วย`)) return
    const r = await fetch(`/api/cems/parts/${p.id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? 'ลบไม่สำเร็จ'); return }
    load()
  }

  const brands = Array.from(new Set(parts.map(p => p.brand).filter(Boolean))) as string[]
  const filtered = parts.filter(p => {
    if (brandFilter && p.brand !== brandFilter) return false
    if (belowMinOnly && !(p.stock < p.minStock)) return false
    const q = search.trim().toLowerCase()
    if (q && !(`${p.code} ${p.name} ${p.location ?? ''}`.toLowerCase().includes(q))) return false
    return true
  })

  const totalValue = parts.reduce((s, p) => s + p.value, 0)
  const belowMin = parts.filter(p => p.stock < p.minStock).length

  return (
    <div>
      {/* summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-slate-700">{parts.length}</p>
          <p className="text-[11px] text-slate-500">รายการอะไหล่</p>
        </div>
        <div className="rounded-lg bg-emerald-50 px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-emerald-700">{money(totalValue)}</p>
          <p className="text-[11px] text-slate-500">มูลค่าคงคลัง (บาท)</p>
        </div>
        <div className={`rounded-lg px-3 py-2.5 text-center ${belowMin ? 'bg-red-50' : 'bg-slate-50'}`}>
          <p className={`text-lg font-bold ${belowMin ? 'text-red-600' : 'text-slate-400'}`}>{belowMin || '—'}</p>
          <p className="text-[11px] text-slate-500">ต่ำกว่า Min stock</p>
        </div>
        <div className="rounded-lg bg-sky-50 px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-sky-700">{parts.filter(p => p.stock > 0).length}</p>
          <p className="text-[11px] text-slate-500">มีของใน stock</p>
        </div>
      </div>

      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ค้นหารหัส / ชื่อ / ตำแหน่ง..."
          className="w-64 rounded border border-slate-300 px-3 py-1.5 text-sm focus:outline-none" />
        <CustomSelect value={brandFilter} onChange={setBrandFilter} placeholder="ทุกยี่ห้อ" className="w-36"
          options={[{ value: '', label: 'ทุกยี่ห้อ' }, ...brands.map(b => ({ value: b, label: b }))]} />
        <button onClick={() => setBelowMinOnly(v => !v)}
          className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${belowMinOnly ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
          ⚠ ต่ำกว่า Min
        </button>
        <p className="text-sm text-slate-400">{filtered.length} รายการ</p>
        <div className="ml-auto flex gap-2">
          <label className={`cursor-pointer rounded px-4 py-2 text-sm font-medium transition-colors ${importing ? 'bg-slate-100 text-slate-400' : 'text-slate-500 hover:bg-slate-100'}`}>
            {importing ? 'กำลังนำเข้า...' : '📥 นำเข้า Excel'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" disabled={importing}
              onChange={e => importFile(e.target.files?.[0])} />
          </label>
          <Btn onClick={() => { setEditPart(null); setAddOpen(true) }}>+ เพิ่มอะไหล่</Btn>
        </div>
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>
            <th className="px-3 py-2 text-left font-medium">รหัส</th>
            <th className="px-3 py-2 text-left font-medium">ชื่อรายการ</th>
            <th className="px-3 py-2 text-left font-medium">ยี่ห้อ</th>
            <th className="px-3 py-2 text-right font-medium">คงเหลือ</th>
            <th className="px-3 py-2 text-right font-medium">Min</th>
            <th className="px-3 py-2 text-right font-medium">ทุนล่าสุด</th>
            <th className="px-3 py-2 text-right font-medium">มูลค่า</th>
            <th className="px-3 py-2 text-left font-medium">ตำแหน่ง</th>
            <th className="px-3 py-2" />
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-300">กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-300">
              {parts.length === 0 ? 'ยังไม่มีอะไหล่ — กด "นำเข้า Excel" หรือ "+ เพิ่มอะไหล่"' : 'ไม่พบรายการตามเงื่อนไข'}
            </td></tr>}
            {filtered.map(p => {
              const low = p.stock < p.minStock
              return (
                <tr key={p.id} className={`border-t border-slate-100 hover:bg-slate-50 ${!p.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2 font-mono text-xs font-medium text-slate-700">{p.code}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-slate-700" title={p.name}>{p.name}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{p.brand ?? '—'}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${low ? 'text-red-600' : p.stock > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                    {p.stock}{low && ' ⚠'}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400">{p.minStock || '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{money(p.refCost)}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{p.value ? money(p.value) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{p.location ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Btn small onClick={() => setTxnModal({ part: p, type: 'IN' })}>+ รับ</Btn>
                      <Btn small variant="ghost" onClick={() => setTxnModal({ part: p, type: 'OUT' })}>− เบิก</Btn>
                      <Btn small variant="ghost" onClick={() => setHistoryPart(p)}>ประวัติ</Btn>
                      <Btn small variant="ghost" onClick={() => { setEditPart(p); setAddOpen(true) }}>แก้</Btn>
                      <Btn small variant="danger" onClick={() => delPart(p)}>ลบ</Btn>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {txnModal && <TxnModal part={txnModal.part} type={txnModal.type} sites={sites} analyzers={analyzers}
        onClose={() => setTxnModal(null)} onSaved={() => { setTxnModal(null); load() }} />}
      {historyPart && <HistoryModal part={historyPart} onClose={() => setHistoryPart(null)} onChanged={load} />}
      {addOpen && <PartModal part={editPart} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load() }} />}
    </div>
  )
}

// ── Modal: รับเข้า / เบิกออก ─────────────────────────────────
function TxnModal({ part, type, sites, analyzers, onClose, onSaved }: {
  part: PartRow; type: 'IN' | 'OUT'; sites: SiteOpt[]; analyzers: AnalyzerOpt[]
  onClose: () => void; onSaved: () => void
}) {
  const [qty, setQty] = useState('')
  const [unitCost, setUnitCost] = useState(part.refCost != null ? String(part.refCost) : '')
  const [txnDate, setTxnDate] = useState(todayKey())
  const [siteId, setSiteId] = useState('')
  const [manualSite, setManualSite] = useState('')
  const [analyzerId, setAnalyzerId] = useState('')
  const [quoteNo, setQuoteNo] = useState('')
  const [person, setPerson] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // เครื่องที่ไซต์ที่เลือก ขึ้นก่อน
  const anOpts = [...analyzers].sort((a, b) => {
    const sid = siteId ? parseInt(siteId) : null
    return (a.currentSiteId === sid ? 0 : 1) - (b.currentSiteId === sid ? 0 : 1)
  })

  async function save() {
    if (!qty || parseFloat(qty) <= 0) { setErr('กรอกจำนวน'); return }
    setSaving(true); setErr('')
    const body: Record<string, unknown> = { partId: part.id, type, qty, txnDate, person: person || undefined, notes: notes || undefined }
    if (type === 'IN') body.unitCost = unitCost || undefined
    else Object.assign(body, {
      siteId: siteId || undefined, manualSite: manualSite || undefined,
      analyzerId: analyzerId || undefined, quoteNo: quoteNo || undefined,
    })
    const r = await fetch('/api/cems/part-txns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'บันทึกไม่สำเร็จ'); return }
    onSaved()
  }

  return (
    <Modal title={`${type === 'IN' ? '📥 รับเข้า' : '📤 เบิกออก'} — ${part.code}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {part.name}<br />คงเหลือปัจจุบัน <b className="text-slate-700">{part.stock}</b> {part.unit ?? ''}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input label={`จำนวน (${part.unit ?? 'หน่วย'})`} value={qty} onChange={setQty} type="number" required />
          <Input label="วันที่" value={txnDate} onChange={setTxnDate} type="date" />
        </div>
        {type === 'IN' ? (
          <Input label="ต้นทุน/หน่วย (บาท)" value={unitCost} onChange={setUnitCost} type="number" placeholder="ราคาล็อตนี้" />
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">ไซต์ที่นำไปใช้</label>
              <CustomSelect value={siteId} onChange={v => { setSiteId(v); if (v) setManualSite('') }} placeholder="— เลือกไซต์ —"
                options={[{ value: '', label: '— เลือกไซต์ —' }, ...sites.map(s => ({ value: String(s.id), label: s.code }))]} />
              <input value={manualSite} onChange={e => { setManualSite(e.target.value); if (e.target.value) setSiteId('') }}
                placeholder="หรือพิมพ์ชื่อไซต์นอกฐานข้อมูล"
                className="rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">ใช้กับเครื่อง (Analyzer)</label>
              <CustomSelect value={analyzerId} onChange={setAnalyzerId} placeholder="— ไม่ระบุ —"
                options={[{ value: '', label: '— ไม่ระบุ —' }, ...anOpts.map(a => ({ value: String(a.id), label: a.tag }))]} />
            </div>
            <Input label="เลขใบเสนอราคา" value={quoteNo} onChange={setQuoteNo} placeholder="เช่น QT2026-001" />
          </>
        )}
        <Input label={type === 'IN' ? 'ผู้รับเข้า' : 'ผู้เบิก'} value={person} onChange={setPerson} />
        <Input label="หมายเหตุ" value={notes} onChange={setNotes} />
        {err && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>ยกเลิก</Btn>
          <Btn onClick={save}>{saving ? 'กำลังบันทึก...' : type === 'IN' ? 'บันทึกรับเข้า' : 'บันทึกเบิกออก'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ── Modal: ประวัติ ───────────────────────────────────────────
function HistoryModal({ part, onClose, onChanged }: { part: PartRow; onClose: () => void; onChanged: () => void }) {
  const [txns, setTxns] = useState<TxnRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/cems/part-txns?partId=${part.id}`)
    if (r.ok) setTxns(await r.json())
    setLoading(false)
  }, [part.id])
  useEffect(() => { load() }, [load])

  async function delTxn(t: TxnRow) {
    if (!confirm(`ลบรายการ${TXN_META[t.type].label} ${t.qty} ${part.unit ?? ''} วันที่ ${fmtDate(t.txnDate)} ?`)) return
    await fetch(`/api/cems/part-txns/${t.id}`, { method: 'DELETE' })
    load(); onChanged()
  }

  return (
    <Modal title={`⏱ ประวัติ — ${part.code}`} onClose={onClose} wide>
      <p className="mb-3 text-xs text-slate-400">{part.name} · คงเหลือ {part.stock} {part.unit ?? ''}</p>
      {loading ? <p className="py-6 text-center text-sm text-slate-300">กำลังโหลด...</p>
        : txns.length === 0 ? <p className="py-6 text-center text-sm text-slate-300">ยังไม่มีประวัติ</p>
        : (
        <div className="space-y-1.5">
          {txns.map(t => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TXN_META[t.type].chip}`}>{TXN_META[t.type].label}</span>
                <span className="font-semibold text-slate-700">{t.type === 'OUT' ? '−' : '+'}{t.qty} {part.unit ?? ''}</span>
                {t.unitCost != null && <span className="text-slate-400">@ {money(t.unitCost)} ฿</span>}
                {(t.site?.code || t.manualSite) && <span className="text-slate-500">→ {t.site?.code ?? t.manualSite}</span>}
                {t.analyzer && <span className="text-slate-400">· {t.analyzer.tag}</span>}
                {t.quoteNo && <span className="rounded bg-sky-50 px-1 text-[10px] text-sky-600">QT: {t.quoteNo}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{t.person && `${t.person} · `}{fmtDate(t.txnDate)}</span>
                <button onClick={() => delTxn(t)} className="text-red-300 hover:text-red-500">×</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {txns.some(t => t.notes) && (
        <div className="mt-3 space-y-1">
          {txns.filter(t => t.notes).slice(0, 5).map(t => (
            <p key={t.id} className="text-[11px] text-amber-600">📝 {fmtDate(t.txnDate)}: {t.notes}</p>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ── Modal: เพิ่ม/แก้ไขอะไหล่ ─────────────────────────────────
function PartModal({ part, onClose, onSaved }: { part: PartRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: part?.code ?? '', name: part?.name ?? '', brand: part?.brand ?? '', unit: part?.unit ?? 'ชิ้น',
    minStock: part ? String(part.minStock) : '0', location: part?.location ?? '',
    refCost: part?.refCost != null ? String(part.refCost) : '', notes: part?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    if (!form.code || !form.name) { setErr('กรอกรหัสและชื่อรายการ'); return }
    setSaving(true); setErr('')
    const r = part
      ? await fetch(`/api/cems/parts/${part.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      : await fetch('/api/cems/parts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'บันทึกไม่สำเร็จ'); return }
    onSaved()
  }

  return (
    <Modal title={part ? `แก้ไข — ${part.code}` : '+ เพิ่มอะไหล่'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="รหัส" value={form.code} onChange={f('code')} placeholder="เช่น BEK010" required />
          <Input label="ยี่ห้อ" value={form.brand} onChange={f('brand')} placeholder="BEKO / Durag / OPSIS" />
        </div>
        <Input label="ชื่อรายการ" value={form.name} onChange={f('name')} required />
        <div className="grid grid-cols-3 gap-3">
          <Input label="หน่วย" value={form.unit} onChange={f('unit')} placeholder="ชิ้น/ชุด/เมตร" />
          <Input label="Min stock" value={form.minStock} onChange={f('minStock')} type="number" />
          <Input label="ตำแหน่งเก็บ" value={form.location} onChange={f('location')} placeholder="A1, F3" />
        </div>
        <Input label="ราคาอ้างอิง (บาท/หน่วย)" value={form.refCost} onChange={f('refCost')} type="number" placeholder="อัปเดตอัตโนมัติเมื่อรับเข้า" />
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

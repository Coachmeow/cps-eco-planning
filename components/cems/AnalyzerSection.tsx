'use client'

import { useCallback, useEffect, useState } from 'react'
import { Cpu } from 'lucide-react'
import { Btn, Input, Modal, CustomSelect, resizeImage, OWNERSHIP_LABEL, OWNERSHIP_CHIP, AN_STATUS_LABEL, AN_STATUS_CHIP, fmtDate } from '@/components/cems/ui'
import { DeleteConfirmModal, DeletionLogButton } from '@/components/DeleteControls'
import AnalyzerCard from '@/components/cems/AnalyzerCard'
import type { CemsSiteRow } from '@/components/cems/CemsSitesSection'

export interface AnalyzerRow {
  id: number; tag: string; brand: string | null; model: string | null; serialNo: string | null
  parameter: string | null; ownership: string; status: string
  homeSiteId: number | null; homeSite: { id: number; code: string } | null
  currentSiteId: number | null; currentSite: { id: number; code: string } | null
  receivedDate: string | null; statusUpdatedAt: string; notes: string | null
  hasPhoto?: boolean; _count?: { events: number }
}

const OWNERSHIPS = ['POOL_OWN', 'POOL_LEGACY', 'CUSTOMER']
const STATUSES   = ['READY', 'IN_USE', 'REPAIR', 'RETIRED']

export default function AnalyzerSection({ canManage = false }: { canManage?: boolean }) {
  const [analyzers, setAnalyzers] = useState<AnalyzerRow[]>([])
  const [sites, setSites]         = useState<CemsSiteRow[]>([])
  const [search, setSearch]       = useState('')
  const [fSite, setFSite]         = useState('')
  const [fStatus, setFStatus]     = useState('')
  const [fOwner, setFOwner]       = useState('')
  const [modal, setModal]         = useState(false)
  const [editing, setEditing]     = useState<AnalyzerRow | null>(null)
  const [viewing, setViewing]     = useState<AnalyzerRow | null>(null)
  const [saving, setSaving]       = useState(false)
  const [photo, setPhoto]         = useState<string | null>(null)
  const [photoTouched, setPhotoTouched] = useState(false)
  const [delTarget, setDelTarget] = useState<AnalyzerRow | null>(null)

  const init = { tag: '', brand: '', model: '', serialNo: '', parameter: '', ownership: 'POOL_OWN', homeSiteId: '', currentSiteId: '', status: 'READY', receivedDate: '', notes: '' }
  const [form, setForm] = useState(init)

  const load = useCallback(async () => {
    const [aRes, sRes] = await Promise.all([
      fetch('/api/cems/analyzers').then(r => r.json()),
      fetch('/api/cems/sites').then(r => r.json()),
    ])
    if (Array.isArray(aRes)) setAnalyzers(aRes)
    if (Array.isArray(sRes)) setSites(sRes)
  }, [])
  useEffect(() => { load() }, [load])

  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }))

  function openAdd() {
    setForm(init); setPhoto(null); setPhotoTouched(false); setEditing(null); setModal(true)
  }
  function openEdit(a: AnalyzerRow) {
    setForm({
      tag: a.tag, brand: a.brand ?? '', model: a.model ?? '', serialNo: a.serialNo ?? '',
      parameter: a.parameter ?? '', ownership: a.ownership,
      homeSiteId: a.homeSiteId != null ? String(a.homeSiteId) : '',
      currentSiteId: a.currentSiteId != null ? String(a.currentSiteId) : '',
      status: a.status, receivedDate: a.receivedDate?.slice(0, 10) ?? '', notes: a.notes ?? '',
    })
    setPhoto(null); setPhotoTouched(false); setEditing(a); setModal(true)
  }

  async function save() {
    if (!form.tag) return
    setSaving(true)
    const body: Record<string, unknown> = { ...form }
    if (photoTouched) body.photoUrl = photo
    const res = editing
      ? await fetch(`/api/cems/analyzers/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/cems/analyzers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'บันทึกไม่สำเร็จ'); return }
    setModal(false); load()
  }

  // ย้ายที่เร็วจากแถว → สร้าง MOVE event (sync สถานะอัตโนมัติ)
  async function quickMove(a: AnalyzerRow, siteId: string) {
    const target = siteId ? sites.find(s => String(s.id) === siteId)?.code : 'หน่วยงาน (Pool)'
    if (!confirm(`ย้าย "${a.tag}" ไป ${target} ?`)) { load(); return }
    await fetch('/api/cems/analyzer-events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analyzerId: a.id, type: 'MOVE', siteId: siteId || null }),
    })
    load()
  }

  const q = search.trim().toLowerCase()
  const filtered = analyzers.filter(a => {
    if (fSite === 'pool' ? a.currentSiteId != null : (fSite && String(a.currentSiteId ?? '') !== fSite)) return false
    if (fStatus && a.status !== fStatus) return false
    if (fOwner && a.ownership !== fOwner) return false
    if (q && !(`${a.tag} ${a.brand ?? ''} ${a.model ?? ''} ${a.serialNo ?? ''} ${a.parameter ?? ''}`.toLowerCase().includes(q))) return false
    return true
  })

  const siteOpts = [{ value: '', label: 'หน่วยงาน (Pool)' }, ...sites.map(s => ({ value: String(s.id), label: s.code }))]

  return (
    <div>
      {/* filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ค้นหา tag / ยี่ห้อ / รุ่น / serial..."
          className="w-64 rounded border border-slate-300 px-3 py-1.5 text-sm focus:outline-none" />
        <CustomSelect value={fSite} onChange={setFSite} placeholder="ทุกที่อยู่" className="w-44"
          options={[{ value: '', label: 'ทุกที่อยู่' }, { value: 'pool', label: 'หน่วยงาน (Pool)' }, ...sites.map(s => ({ value: String(s.id), label: s.code }))]} />
        <CustomSelect value={fStatus} onChange={setFStatus} placeholder="ทุกสถานะ" className="w-36"
          options={[{ value: '', label: 'ทุกสถานะ' }, ...STATUSES.map(s => ({ value: s, label: AN_STATUS_LABEL[s] }))]} />
        <CustomSelect value={fOwner} onChange={setFOwner} placeholder="ทุกแหล่งที่มา" className="w-40"
          options={[{ value: '', label: 'ทุกแหล่งที่มา' }, ...OWNERSHIPS.map(o => ({ value: o, label: OWNERSHIP_LABEL[o] }))]} />
        <p className="text-sm text-slate-400">{filtered.length} เครื่อง</p>
        {canManage && <div className="ml-auto flex gap-2"><DeletionLogButton group="cems" /><Btn onClick={openAdd}>+ เพิ่มเครื่อง</Btn></div>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>
            <th className="px-3 py-2 text-left font-medium">Tag / เครื่อง</th>
            <th className="px-3 py-2 text-left font-medium">ยี่ห้อ · รุ่น</th>
            <th className="px-3 py-2 text-left font-medium">Parameter</th>
            <th className="px-3 py-2 text-left font-medium">แหล่งที่มา</th>
            <th className="px-3 py-2 text-left font-medium">ที่อยู่ปัจจุบัน</th>
            <th className="px-3 py-2 text-left font-medium">สถานะ</th>
            <th className="px-3 py-2 text-left font-medium">อัพเดทเมื่อ</th>
            <th className="px-3 py-2" />
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-xs text-slate-300">ไม่มีเครื่อง</td></tr>}
            {filtered.map(a => (
              <tr key={a.id} className={`border-t border-slate-100 hover:bg-slate-50 ${a.status === 'RETIRED' ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2">
                  <button onClick={() => setViewing(a)} className="flex items-center gap-2 text-left hover:text-emerald-700">
                    {a.hasPhoto ? <img src={`/api/cems/analyzers/${a.id}/photo`} alt="" className="h-7 w-7 rounded object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-100"><Cpu className="h-4 w-4 text-slate-400" /></span>}
                    <span className="font-medium text-slate-700">{a.tag}</span>
                  </button>
                </td>
                <td className="px-3 py-2 text-slate-500">{[a.brand, a.model].filter(Boolean).join(' · ') || '—'}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{a.parameter ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${OWNERSHIP_CHIP[a.ownership]}`}>{OWNERSHIP_LABEL[a.ownership]}</span>
                  {a.ownership === 'CUSTOMER' && a.homeSite && <span className="ml-1 text-[10px] text-slate-400">{a.homeSite.code}</span>}
                </td>
                <td className="px-3 py-2">
                  <select value={a.currentSiteId != null ? String(a.currentSiteId) : ''} onChange={e => quickMove(a, e.target.value)}
                    title="ย้ายที่ (บันทึกประวัติ MOVE อัตโนมัติ)"
                    className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none">
                    {siteOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${AN_STATUS_CHIP[a.status]}`}>{AN_STATUS_LABEL[a.status]}</span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">{fmtDate(a.statusUpdatedAt)}</td>
                <td className="px-3 py-2 text-right">
                  {canManage && <Btn small onClick={() => openEdit(a)}>แก้ไข</Btn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal เพิ่ม/แก้เครื่อง */}
      {modal && (
        <Modal title={editing ? `แก้ไขเครื่อง: ${editing.tag}` : 'เพิ่มเครื่อง Analyzer'} onClose={() => setModal(false)}>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {photo ? <img src={photo} alt="" className="h-16 w-16 rounded-lg object-cover" />
                : (editing?.hasPhoto && !photoTouched) ? <img src={`/api/cems/analyzers/${editing.id}/photo`} alt="" className="h-16 w-16 rounded-lg object-cover" />
                : <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100"><Cpu className="h-7 w-7 text-slate-300" /></span>}
              <div className="flex flex-col gap-1">
                <label className="cursor-pointer rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">เลือกรูป...
                  <input type="file" accept="image/*" className="hidden" onChange={async ev => { const file = ev.target.files?.[0]; if (file) { setPhoto(await resizeImage(file)); setPhotoTouched(true) } }} />
                </label>
                {(photo || editing?.hasPhoto) && <button onClick={() => { setPhoto(null); setPhotoTouched(true) }} className="text-[11px] text-red-400 hover:text-red-600">ลบรูป</button>}
              </div>
            </div>
            <Input label="Tag / รหัสเครื่อง" value={form.tag} onChange={f('tag')} placeholder="เช่น NOx-01" required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="ยี่ห้อ" value={form.brand} onChange={f('brand')} placeholder="เช่น Horiba" />
              <Input label="รุ่น" value={form.model} onChange={f('model')} placeholder="เช่น ENDA-5000" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Serial No." value={form.serialNo} onChange={f('serialNo')} />
              <Input label="Parameter ที่วัด" value={form.parameter} onChange={f('parameter')} placeholder="SO2/NOx/CO/O2" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">แหล่งที่มา</label>
              <CustomSelect value={form.ownership} onChange={f('ownership')}
                options={OWNERSHIPS.map(o => ({ value: o, label: OWNERSHIP_LABEL[o] }))} />
            </div>
            {form.ownership === 'CUSTOMER' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">ไซต์เจ้าของเครื่อง</label>
                <CustomSelect value={form.homeSiteId} onChange={f('homeSiteId')} placeholder="— เลือกไซต์ —"
                  options={sites.map(s => ({ value: String(s.id), label: s.code }))} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">ที่อยู่ปัจจุบัน</label>
                <CustomSelect value={form.currentSiteId} onChange={f('currentSiteId')}
                  options={[{ value: '', label: 'หน่วยงาน (Pool)' }, ...sites.map(s => ({ value: String(s.id), label: s.code }))]} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">สถานะ</label>
                <CustomSelect value={form.status} onChange={f('status')}
                  options={STATUSES.map(s => ({ value: s, label: AN_STATUS_LABEL[s] }))} />
              </div>
            </div>
            <Input label="วันรับเข้า (นับอายุใช้งาน)" value={form.receivedDate} onChange={f('receivedDate')} type="date" />
            <Input label="หมายเหตุ" value={form.notes} onChange={f('notes')} placeholder="..." />
            {editing && canManage && (
              <div className="mt-1 space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
                <p className="text-xs font-semibold text-red-600">คำเตือน</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">แค่เลิกใช้? ตั้งสถานะเป็น <b>&quot;ปลดระวาง&quot;</b> ด้านบนแทน · ลบถาวร — ประวัติทั้งหมดจะหายด้วย (ข้อมูลคนลบ วันที่ลบจะถูกเก็บในระบบ)</span>
                  <Btn small variant="danger" onClick={() => { setDelTarget(editing); setModal(false) }}>ลบถาวร</Btn>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setModal(false)}>ยกเลิก</Btn>
              <Btn onClick={save}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {delTarget && (
        <DeleteConfirmModal
          token={delTarget.tag}
          label={`Analyzer ${delTarget.tag}`}
          impact={[`ประวัติการเคลื่อนย้าย/ซ่อม ${delTarget._count?.events ?? 0} รายการจะถูกลบด้วย`]}
          endpoint={`/api/cems/analyzers/${delTarget.id}`}
          onClose={() => setDelTarget(null)}
          onDone={() => { setDelTarget(null); load() }}
        />
      )}

      {viewing && <AnalyzerCard analyzerId={viewing.id} sites={sites} canManage={canManage} onClose={() => { setViewing(null); load() }} />}
    </div>
  )
}

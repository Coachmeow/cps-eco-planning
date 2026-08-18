'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { SITE_COLOR_OPTIONS } from '@/lib/siteColors'
import SearchableSelect from '@/components/SearchableSelect'
import { useMe } from '@/hooks/useMe'
import { ROLE_LABEL, ROLE_ORDER, type UserRole } from '@/lib/roles'
import { toDateKey } from '@/lib/dateKey'
import Avatar from '@/components/Avatar'
import EmployeeCard from '@/components/EmployeeCard'
import EquipmentCard from '@/components/EquipmentCard'
import VehicleCard from '@/components/VehicleCard'
import VehicleLogbook from '@/components/VehicleLogbook'

// ย่อรูปด้วย canvas → JPEG ~256px คืน data URL (เก็บใน DB เป็น base64)
async function resizeImage(file: File, max = 256, quality = 0.8): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl
  })
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

// ── Types ─────────────────────────────────────────────────────
interface Team     { id: number; code: string; name: string }
interface EqType   { id: number; code: string; name: string; primaryTeamId: number; requiresCal?: boolean }
interface SubTeamRow { id: number; teamId: number; name: string; sortOrder: number; team?: { code: string }; _count?: { members: number } }
interface Employee {
  id: number; fullName: string; nickname: string | null; primaryTeamId: number; primaryTeam: Team; isActive: boolean
  phone?: string | null; hasPhoto?: boolean; birthDate?: string | null; startDate?: string | null; eduLevel?: string | null; eduField?: string | null; eduInstitute?: string | null
  subTeamId?: number | null; subTeam?: { id: number; name: string } | null; subTeamOrder?: number; isSubLeader?: boolean
  inPlanner?: boolean
}
interface Site     { id: number; code: string; name: string; clientName: string | null; province: string | null; region: string | null; color: string | null; requiresAccess: string[] }
interface Equipment {
  id: number; typeId: number; type: EqType; internalNo: string | null; serialNo: string | null
  isRental: boolean; rentalVendor: string | null; rentalStartDate: string | null; rentalEndDate: string | null
  status: string; notes: string | null
  brand?: string | null; model?: string | null; vendor?: string | null
  purchaseDate?: string | null; purchasePrice?: number | null; lifespanYears?: number | null; calDueDate?: string | null
  hasPhoto?: boolean
}

const TEAM_COLOR: Record<string, string> = {
  ST: 'bg-slate-200 text-slate-700', AMB: 'bg-teal-100 text-teal-700',
  WP: 'bg-purple-100 text-purple-700', CEMS: 'bg-orange-100 text-orange-700',
  WT: 'bg-blue-100 text-blue-700', LOG: 'bg-gray-100 text-gray-600',
}

// ── Shared UI ─────────────────────────────────────────────────
function Btn({ children, onClick, variant = 'default', small, disabled }: { children: React.ReactNode; onClick?: () => void; variant?: 'default' | 'danger' | 'ghost'; small?: boolean; disabled?: boolean }) {
  const base = `rounded font-medium transition-colors ${small ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`
  const cls  = variant === 'danger'  ? `${base} bg-red-50 text-red-600 hover:bg-red-100`
             : variant === 'ghost'   ? `${base} text-slate-500 hover:bg-slate-100`
             : `${base} bg-slate-800 text-white hover:bg-slate-700`
  return <button className={cls} onClick={onClick} disabled={disabled}>{children}</button>
}

function Input({ label, value, onChange, type = 'text', placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}{required && <span className="ml-0.5 text-red-500">*</span>}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:border-slate-500 focus:outline-none" />
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

// ── Custom Select (styled dropdown) ───────────────────────────
function CustomSelect({ value, onChange, options, placeholder, className }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none"
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? selected.label : (placeholder ?? 'เลือก...')}
        </span>
        <span className="ml-2 shrink-0 text-slate-400 text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50
                ${value === o.value ? 'bg-sky-50 font-semibold text-sky-700' : 'text-slate-800'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Section: Sites ────────────────────────────────────────────
function SitesSection() {
  const [sites, setSites]   = useState<Site[]>([])
  const [modal, setModal]   = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Site | null>(null)
  const [form, setForm]     = useState({ code: '', name: '', clientName: '', province: '', region: '', color: 'emerald', requiresAccess: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/sites'); setSites(await r.json())
  }, [])
  useEffect(() => { load() }, [load])

  function openAdd() {
    setForm({ code: '', name: '', clientName: '', province: '', region: '', color: 'emerald', requiresAccess: '' })
    setEditing(null); setModal('add')
  }
  function openEdit(s: Site) {
    setForm({ code: s.code, name: s.name, clientName: s.clientName ?? '', province: s.province ?? '', region: s.region ?? '', color: s.color ?? 'emerald', requiresAccess: s.requiresAccess.join(', ') })
    setEditing(s); setModal('edit')
  }

  async function save() {
    if (!form.code || !form.name) return
    setSaving(true)
    const body = { ...form, requiresAccess: form.requiresAccess ? form.requiresAccess.split(',').map(s => s.trim()).filter(Boolean) : [] }
    if (modal === 'add') {
      await fetch('/api/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else if (editing) {
      await fetch(`/api/sites/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    setSaving(false); setModal(null); load()
  }

  async function del(s: Site) {
    if (!confirm(`ลบไซต์ "${s.name}" ?`)) return
    await fetch(`/api/sites/${s.id}`, { method: 'DELETE' }); load()
  }

  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">{sites.length} ไซต์</p>
        <Btn onClick={openAdd}>+ เพิ่มไซต์</Btn>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">สี</th>
              <th className="px-4 py-2 text-left font-medium">Code</th>
              <th className="px-4 py-2 text-left font-medium">ชื่อ</th>
              <th className="px-4 py-2 text-left font-medium">บริษัท</th>
              <th className="px-4 py-2 text-left font-medium">จังหวัด</th>
              <th className="px-4 py-2 text-left font-medium">ต้องการ Access</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {sites.map(s => {
              const colorOpt = SITE_COLOR_OPTIONS.find(c => c.value === (s.color ?? 'emerald')) ?? SITE_COLOR_OPTIONS[0]
              return (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-semibold ${colorOpt.preview}`}>
                      {s.code}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono font-semibold text-slate-700">{s.code}</td>
                  <td className="px-4 py-2 text-slate-700">{s.name}</td>
                  <td className="px-4 py-2 text-slate-400">{s.clientName ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-500">{s.province ?? '—'}</td>
                  <td className="px-4 py-2">
                    {s.requiresAccess.length > 0
                      ? <div className="flex flex-wrap gap-1">{s.requiresAccess.map(a => <span key={a} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{a}</span>)}</div>
                      : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Btn small onClick={() => openEdit(s)}>แก้ไข</Btn>
                      <Btn small variant="danger" onClick={() => del(s)}>ลบ</Btn>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? 'เพิ่มไซต์งาน' : 'แก้ไขไซต์'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <Input label="Site Code" value={form.code} onChange={f('code')} placeholder="เช่น SKK" required />
            <Input label="ชื่อไซต์" value={form.name} onChange={f('name')} placeholder="ชื่อโรงงาน / พื้นที่" required />
            <Input label="บริษัท (จดทะเบียน)" value={form.clientName} onChange={f('clientName')} placeholder="ชื่อบริษัทตามกฎหมาย" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="จังหวัด" value={form.province} onChange={f('province')} placeholder="เช่น ขอนแก่น" />
              <Input label="ภูมิภาค" value={form.region} onChange={f('region')} placeholder="เช่น ภาคกลาง" />
            </div>
            <Input label="Access ที่ต้องการ (คั่นด้วย , )" value={form.requiresAccess} onChange={f('requiresAccess')} placeholder="เช่น NS-SUS, SCGP" />
            {/* Color picker */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">สีในปฏิทิน</label>
              <div className="flex flex-wrap gap-2">
                {SITE_COLOR_OPTIONS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => f('color')(c.value)}
                    className={`h-7 w-7 rounded-full ${c.dot} transition-all hover:scale-110 ${
                      form.color === c.value
                        ? 'ring-2 ring-offset-2 ring-slate-700 scale-110'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
              {/* Preview */}
              <div className={`mt-1 inline-flex w-fit rounded border px-2.5 py-1 text-xs font-semibold ${SITE_COLOR_OPTIONS.find(c => c.value === form.color)?.preview ?? ''}`}>
                {form.code || 'CODE'} — {SITE_COLOR_OPTIONS.find(c => c.value === form.color)?.label}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setModal(null)}>ยกเลิก</Btn>
              <Btn onClick={save}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Section: Employees ────────────────────────────────────────
function EmployeesSection() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [teams,     setTeams]     = useState<Team[]>([])
  const [subTeams,  setSubTeams]  = useState<SubTeamRow[]>([])
  const [modal, setModal]         = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing]     = useState<Employee | null>(null)
  const [form, setForm]           = useState({ fullName: '', nickname: '', primaryTeamId: '', phone: '', birthDate: '', startDate: '', eduLevel: '', eduField: '', eduInstitute: '', subTeamId: '', subTeamOrder: '', isSubLeader: false, inPlanner: true })
  const [photo, setPhoto]         = useState<string | null>(null)   // data URL ใหม่ (ถ้าอัปโหลด)
  const [photoTouched, setPhotoTouched] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [search, setSearch]       = useState('')
  const [viewing, setViewing]     = useState<Employee | null>(null) // การ์ดประวัติ
  // จัดการทีมย่อย
  const [subModal,   setSubModal]   = useState(false)
  const [subForm,    setSubForm]    = useState({ teamId: '', name: '', sortOrder: '' })
  const [editingSub, setEditingSub] = useState<SubTeamRow | null>(null)
  const [subSaving,  setSubSaving]  = useState(false)

  const load = useCallback(async () => {
    const [eRes, tRes, sRes] = await Promise.all([
      fetch('/api/employees?all=true').then(r => r.json()),
      fetch('/api/teams').then(r => r.json()),
      fetch('/api/sub-teams').then(r => r.json()),
    ])
    setEmployees(eRes); setTeams(tRes); setSubTeams(sRes)
  }, [])
  useEffect(() => { load() }, [load])

  function openAdd() {
    setForm({ fullName: '', nickname: '', primaryTeamId: String(teams[0]?.id ?? ''), phone: '', birthDate: '', startDate: '', eduLevel: '', eduField: '', eduInstitute: '', subTeamId: '', subTeamOrder: '', isSubLeader: false, inPlanner: true })
    setPhoto(null); setPhotoTouched(false)
    setEditing(null); setModal('add')
  }
  function openEdit(e: Employee) {
    setForm({
      fullName: e.fullName, nickname: e.nickname ?? '', primaryTeamId: String(e.primaryTeamId), phone: e.phone ?? '',
      birthDate: e.birthDate?.slice(0, 10) ?? '', startDate: e.startDate?.slice(0, 10) ?? '',
      eduLevel: e.eduLevel ?? '', eduField: e.eduField ?? '', eduInstitute: e.eduInstitute ?? '',
      subTeamId: e.subTeamId != null ? String(e.subTeamId) : '',
      subTeamOrder: e.subTeamOrder != null && e.subTeamOrder !== 999 ? String(e.subTeamOrder) : '',
      isSubLeader: !!e.isSubLeader,
      inPlanner: e.inPlanner !== false,
    })
    setPhoto(null); setPhotoTouched(false)
    setEditing(e); setModal('edit')
  }

  async function onPickPhoto(file?: File) {
    if (!file) return
    const resized = await resizeImage(file)
    setPhoto(resized); setPhotoTouched(true)
  }

  async function save() {
    if (!form.fullName || !form.primaryTeamId) return
    setSaving(true)
    // ส่ง photoUrl เฉพาะตอนผู้ใช้แตะรูป (กันทับรูปเดิมเป็น null)
    const body: Record<string, unknown> = { ...form }
    if (photoTouched) body.photoUrl = photo
    if (modal === 'add') {
      await fetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else if (editing) {
      await fetch(`/api/employees/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, isActive: editing.isActive }) })
    }
    setSaving(false); setModal(null); load()
  }

  async function toggleActive(e: Employee) {
    // ยืนยันก่อนปิดการใช้งาน (กันพลาด — คนที่ปิดจะหายจากแผนงาน)
    if (e.isActive && !confirm(`ปิดการใช้งาน "${e.fullName}" ?\nพนักงานจะถูกนำออกจากแผนงาน (เปิดกลับได้ภายหลัง)`)) return
    await fetch(`/api/employees/${e.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: e.fullName, nickname: e.nickname, primaryTeamId: e.primaryTeamId, isActive: !e.isActive }) })
    load()
  }

  async function del(e: Employee) {
    if (!confirm(`ลบพนักงาน "${e.fullName}" ? ข้อมูลการทำงานจะถูกลบด้วย`)) return
    await fetch(`/api/employees/${e.id}`, { method: 'DELETE' }); load()
  }

  // ── จัดการทีมย่อย ──
  const subCount = (subId: number) => employees.filter(e => e.subTeamId === subId).length
  function resetSubForm() { setEditingSub(null); setSubForm({ teamId: teams[0] ? String(teams[0].id) : '', name: '', sortOrder: '' }) }
  function editSub(s: SubTeamRow) { setEditingSub(s); setSubForm({ teamId: String(s.teamId), name: s.name, sortOrder: String(s.sortOrder) }) }
  async function saveSub() {
    if (!subForm.teamId || !subForm.name) return
    setSubSaving(true)
    const body = { teamId: parseInt(subForm.teamId), name: subForm.name, sortOrder: subForm.sortOrder ? parseInt(subForm.sortOrder) : 1 }
    const res = editingSub
      ? await fetch(`/api/sub-teams/${editingSub.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/sub-teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSubSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'บันทึกไม่สำเร็จ'); return }
    resetSubForm(); load()
  }
  async function delSub(s: SubTeamRow) {
    const cnt = subCount(s.id)
    if (!confirm(`ลบทีมย่อย "${s.name}" ?${cnt > 0 ? `\nสมาชิก ${cnt} คนจะกลับเป็นไม่มีทีมย่อย` : ''}`)) return
    const res = await fetch(`/api/sub-teams/${s.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'ลบไม่สำเร็จ'); return }
    load()
  }

  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }))
  const filtered = employees.filter(e => !search || e.fullName.includes(search) || (e.nickname ?? '').includes(search))

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ..." className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm focus:outline-none" />
        <p className="text-sm text-slate-400">{filtered.length} คน</p>
        <Btn variant="ghost" onClick={() => { resetSubForm(); setSubModal(true) }}>👥 จัดการทีมย่อย</Btn>
        <Btn onClick={openAdd}>+ เพิ่มพนักงาน</Btn>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr><th className="px-4 py-2 text-left font-medium">ชื่อ-สกุล</th><th className="px-4 py-2 text-left font-medium">ชื่อเล่น</th><th className="px-4 py-2 text-left font-medium">ทีม</th><th className="px-4 py-2 text-left font-medium">สถานะ</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} className={`border-t border-slate-100 hover:bg-slate-50 ${!e.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2">
                  <button onClick={() => setViewing(e)} className="flex items-center gap-2 text-left hover:text-emerald-700">
                    <Avatar employeeId={e.id} name={e.nickname ?? e.fullName} hasPhoto={e.hasPhoto} size="sm" />
                    <span className="font-medium text-slate-700">{e.fullName}</span>
                    {e.inPlanner === false && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">สำนักงาน</span>}
                  </button>
                </td>
                <td className="px-4 py-2 text-slate-500">{e.nickname ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${TEAM_COLOR[e.primaryTeam.code] ?? 'bg-slate-100 text-slate-600'}`}>{e.primaryTeam.code}</span>
                  {e.subTeam && (
                    <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {e.subTeam.name}{e.isSubLeader && <span className="ml-0.5 text-amber-500">★</span>}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => toggleActive(e)} className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${e.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                    {e.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1.5">
                    <Btn small onClick={() => openEdit(e)}>แก้ไข</Btn>
                    <Btn small variant="danger" onClick={() => del(e)}>ลบ</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? 'เพิ่มพนักงาน' : 'แก้ไขพนักงาน'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            {/* รูปถ่าย */}
            <div className="flex items-center gap-3">
              {photo
                ? <img src={photo} alt="preview" className="h-16 w-16 rounded-full object-cover" />
                : editing
                  ? <Avatar employeeId={editing.id} name={editing.nickname ?? editing.fullName} hasPhoto={editing.hasPhoto} size="lg" className="!h-16 !w-16" />
                  : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-2xl text-slate-300">👤</span>}
              <div className="flex flex-col gap-1">
                <label className="cursor-pointer rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                  เลือกรูป...
                  <input type="file" accept="image/*" className="hidden"
                    onChange={ev => onPickPhoto(ev.target.files?.[0])} />
                </label>
                {(photo || (editing?.hasPhoto)) && (
                  <button onClick={() => { setPhoto(null); setPhotoTouched(true) }} className="text-[11px] text-red-400 hover:text-red-600">ลบรูป</button>
                )}
              </div>
            </div>

            <Input label="ชื่อ-นามสกุล" value={form.fullName} onChange={f('fullName')} placeholder="นายสมชาย ดีมาก" required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="ชื่อเล่น" value={form.nickname} onChange={f('nickname')} placeholder="ชาย" />
              <Input label="เบอร์โทร" value={form.phone} onChange={f('phone')} placeholder="08x-xxx-xxxx" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">ทีม<span className="ml-0.5 text-red-500">*</span></label>
              <CustomSelect
                value={form.primaryTeamId}
                onChange={(v) => setForm(p => ({ ...p, primaryTeamId: v, subTeamId: '', isSubLeader: false }))}
                options={teams.map(t => ({ value: String(t.id), label: `${t.code} — ${t.name}` }))}
              />
            </div>
            {/* ทีมย่อย (เฉพาะทีมที่มีทีมย่อย) */}
            {(() => {
              const subs = subTeams.filter(s => String(s.teamId) === form.primaryTeamId)
              if (subs.length === 0) return null
              return (
                <div className="grid grid-cols-3 items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-600">ทีมย่อย</label>
                    <CustomSelect
                      value={form.subTeamId}
                      onChange={f('subTeamId')}
                      placeholder="— ไม่มี —"
                      options={[{ value: '', label: '— ไม่มี —' }, ...subs.map(s => ({ value: String(s.id), label: s.name }))]}
                    />
                  </div>
                  <Input label="ลำดับในทีมย่อย" value={form.subTeamOrder} onChange={f('subTeamOrder')} type="number" placeholder="1" />
                  <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
                    <input type="checkbox" checked={form.isSubLeader} disabled={!form.subTeamId}
                      onChange={ev => setForm(p => ({ ...p, isSubLeader: ev.target.checked }))} className="h-4 w-4" />
                    หัวหน้าทีมย่อย ★
                  </label>
                </div>
              )
            })()}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.inPlanner}
                  onChange={ev => setForm(p => ({ ...p, inPlanner: ev.target.checked }))} className="h-4 w-4" />
                ลงแผนปฏิทิน (ภาคสนาม)
              </label>
              <p className="mt-1 text-[11px] text-slate-400">ปิดสำหรับ CEMS Admin / Supervisor ที่ไม่ต้องลงแผน — ยังเป็นผู้ใช้ระบบ / ผู้เบิกอะไหล่ได้</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="วันเกิด" value={form.birthDate} onChange={f('birthDate')} type="date" />
              <Input label="วันเริ่มงาน" value={form.startDate} onChange={f('startDate')} type="date" />
            </div>
            <Input label="วุฒิการศึกษา" value={form.eduLevel} onChange={f('eduLevel')} placeholder="ป.ตรี (วท.บ) / ปวส. / ต่ำกว่า ปวส." />
            <Input label="สาขา/คณะ" value={form.eduField} onChange={f('eduField')} placeholder="วิศวกรรมสิ่งแวดล้อม" />
            <Input label="สถาบัน" value={form.eduInstitute} onChange={f('eduInstitute')} placeholder="ม.ขอนแก่น" />
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setModal(null)}>ยกเลิก</Btn>
              <Btn onClick={save}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: จัดการทีมย่อย */}
      {subModal && (
        <Modal title="👥 จัดการทีมย่อย" onClose={() => { setSubModal(false); resetSubForm() }}>
          <div className="space-y-4">
            {/* ฟอร์มเพิ่ม/แก้ */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-500">{editingSub ? `แก้ไข: ${editingSub.name}` : 'เพิ่มทีมย่อยใหม่'}</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">ทีมใหญ่</label>
                  <CustomSelect value={subForm.teamId} onChange={(v) => setSubForm(p => ({ ...p, teamId: v }))}
                    options={teams.map(t => ({ value: String(t.id), label: t.code }))} />
                </div>
                <Input label="ชื่อทีมย่อย" value={subForm.name} onChange={(v) => setSubForm(p => ({ ...p, name: v }))} placeholder="เช่น ทีม 1" required />
                <Input label="ลำดับ" value={subForm.sortOrder} onChange={(v) => setSubForm(p => ({ ...p, sortOrder: v }))} type="number" placeholder="1" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                {editingSub && <Btn variant="ghost" onClick={resetSubForm}>ยกเลิกแก้</Btn>}
                <Btn onClick={saveSub}>{subSaving ? 'กำลังบันทึก...' : editingSub ? 'บันทึกการแก้ไข' : '+ เพิ่มทีมย่อย'}</Btn>
              </div>
            </div>

            {/* รายการทีมย่อย */}
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500"><tr>
                  <th className="px-3 py-2 text-left font-medium">ทีม</th>
                  <th className="px-3 py-2 text-left font-medium">ทีมย่อย</th>
                  <th className="px-3 py-2 text-right font-medium">ลำดับ</th>
                  <th className="px-3 py-2 text-right font-medium">สมาชิก</th>
                  <th className="px-3 py-2" />
                </tr></thead>
                <tbody>
                  {subTeams.length === 0 && <tr><td colSpan={5} className="px-3 py-5 text-center text-xs text-slate-300">ยังไม่มีทีมย่อย</td></tr>}
                  {subTeams.map(s => (
                    <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TEAM_COLOR[teams.find(t => t.id === s.teamId)?.code ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
                          {teams.find(t => t.id === s.teamId)?.code ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700">{s.name}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{s.sortOrder}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{subCount(s.id)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Btn small onClick={() => editSub(s)}>แก้</Btn>
                          <Btn small variant="danger" onClick={() => delSub(s)}>ลบ</Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400">ลบทีมย่อยได้เสมอ — สมาชิกจะกลับเป็น "ไม่มีทีมย่อย" อัตโนมัติ · จัดคนเข้าทีมย่อย/ตั้งหัวหน้า ทำในปุ่ม "แก้ไข" ของพนักงานแต่ละคน</p>
          </div>
        </Modal>
      )}

      {viewing && <EmployeeCard employee={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

// ── Section: Equipment ────────────────────────────────────────
function EquipmentSection({ role }: { role?: UserRole }) {
  const canManage = role === 'ADMIN' || role === 'MANAGER'   // เพิ่ม/แก้ไขครบ
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [eqTypes,   setEqTypes]   = useState<EqType[]>([])
  const [teams,     setTeams]     = useState<Team[]>([])
  const [modal,     setModal]     = useState<'add-owned' | 'add-rental' | 'edit' | null>(null)
  const [editing,   setEditing]   = useState<Equipment | null>(null)
  const [filterType, setFilterType] = useState('')
  const [hideRental, setHideRental] = useState(true) // default ซ่อนเครื่องเช่า — กดเพื่อแสดง
  const [saving,    setSaving]    = useState(false)
  const [viewing,   setViewing]   = useState<Equipment | null>(null)
  // จัดการประเภทเครื่องมือ
  const [typeModal,   setTypeModal]   = useState(false)
  const [typeForm,    setTypeForm]    = useState({ code: '', name: '', primaryTeamId: '', requiresCal: false })
  const [editingType, setEditingType] = useState<EqType | null>(null)
  const [typeSaving,  setTypeSaving]  = useState(false)

  const initOwned  = { typeId: '', internalNo: '', serialNo: '', status: 'ACTIVE', notes: '', brand: '', model: '', vendor: '', purchaseDate: '', purchasePrice: '', lifespanYears: '' }
  const initRental = { typeId: '', internalNo: '', rentalVendor: '', rentalStartDate: '', rentalEndDate: '', notes: '' }
  const [ownedForm,  setOwnedForm]  = useState(initOwned)
  const [rentalForm, setRentalForm] = useState(initRental)
  const [photo, setPhoto]           = useState<string | null>(null)
  const [photoTouched, setPhotoTouched] = useState(false)

  const load = useCallback(async () => {
    const [eRes, tRes, teamRes] = await Promise.all([
      fetch('/api/equipment?all=true').then(r => r.json()),
      fetch('/api/equipment-types').then(r => r.json()),
      fetch('/api/teams').then(r => r.json()),
    ])
    setEquipment(eRes); setEqTypes(tRes); setTeams(teamRes)
  }, [])
  useEffect(() => { load() }, [load])

  async function onPickOwnedPhoto(file?: File) {
    if (!file) return
    setPhoto(await resizeImage(file)); setPhotoTouched(true)
  }

  async function saveOwned() {
    if (!ownedForm.typeId || !ownedForm.internalNo) return
    setSaving(true)
    const body: Record<string, unknown> = { ...ownedForm, isRental: false, typeId: parseInt(ownedForm.typeId) }
    if (photoTouched) body.photoUrl = photo
    if (modal === 'add-owned') {
      await fetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else if (editing) {
      await fetch(`/api/equipment/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    setSaving(false); setModal(null); load()
  }

  async function saveRental() {
    if (!rentalForm.typeId || !rentalForm.internalNo || !rentalForm.rentalEndDate) return
    setSaving(true)
    const body = { ...rentalForm, isRental: true, typeId: parseInt(rentalForm.typeId) }
    if (modal === 'add-rental') {
      await fetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else if (editing) {
      await fetch(`/api/equipment/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    setSaving(false); setModal(null); load()
  }

  function openEdit(eq: Equipment) {
    setEditing(eq)
    if (eq.isRental) {
      setRentalForm({
        typeId: String(eq.typeId), internalNo: eq.internalNo ?? '', rentalVendor: eq.rentalVendor ?? '',
        rentalStartDate: eq.rentalStartDate?.slice(0, 10) ?? '', rentalEndDate: eq.rentalEndDate?.slice(0, 10) ?? '', notes: eq.notes ?? '',
      }); setModal('add-rental')
    } else {
      setOwnedForm({
        typeId: String(eq.typeId), internalNo: eq.internalNo ?? '', serialNo: eq.serialNo ?? '', status: eq.status, notes: eq.notes ?? '',
        brand: eq.brand ?? '', model: eq.model ?? '', vendor: eq.vendor ?? '',
        purchaseDate: eq.purchaseDate?.slice(0, 10) ?? '',
        purchasePrice: eq.purchasePrice != null ? String(eq.purchasePrice) : '',
        lifespanYears: eq.lifespanYears != null ? String(eq.lifespanYears) : '',
      })
      setPhoto(null); setPhotoTouched(false)
      setModal('edit')
    }
  }

  // ส่งฟิลด์ครบทุกตัว (กันฟิลด์ที่ไม่ได้ส่งถูก set เป็น null) แล้ว override เฉพาะที่ต้องการ
  async function putEquipment(eq: Equipment, overrides: Record<string, unknown>) {
    await fetch(`/api/equipment/${eq.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        typeId: eq.typeId, internalNo: eq.internalNo, serialNo: eq.serialNo, isRental: eq.isRental,
        rentalVendor: eq.rentalVendor, rentalStartDate: eq.rentalStartDate, rentalEndDate: eq.rentalEndDate,
        status: eq.status, notes: eq.notes, brand: eq.brand, model: eq.model, vendor: eq.vendor,
        purchaseDate: eq.purchaseDate, purchasePrice: eq.purchasePrice, lifespanYears: eq.lifespanYears,
        ...overrides,
      }) })
    load()
  }
  const changeStatus = (eq: Equipment, status: string) => putEquipment(eq, { status })

  async function del(eq: Equipment) {
    if (!confirm(`ลบ "${eq.internalNo ?? eq.serialNo}" ? ประวัติการใช้งานจะถูกลบด้วย`)) return
    await fetch(`/api/equipment/${eq.id}`, { method: 'DELETE' }); load()
  }

  // ── จัดการประเภทเครื่องมือ ──
  const typeCount = (typeId: number) => equipment.filter(e => e.typeId === typeId).length
  function resetTypeForm() { setEditingType(null); setTypeForm({ code: '', name: '', primaryTeamId: teams[0] ? String(teams[0].id) : '', requiresCal: false }) }
  function editType(t: EqType) { setEditingType(t); setTypeForm({ code: t.code, name: t.name, primaryTeamId: String(t.primaryTeamId), requiresCal: !!t.requiresCal }) }
  async function saveType() {
    if (!typeForm.code || !typeForm.name || !typeForm.primaryTeamId) return
    setTypeSaving(true)
    const body = { code: typeForm.code, name: typeForm.name, primaryTeamId: parseInt(typeForm.primaryTeamId), requiresCal: typeForm.requiresCal }
    const res = editingType
      ? await fetch(`/api/equipment-types/${editingType.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/equipment-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setTypeSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'บันทึกไม่สำเร็จ'); return }
    resetTypeForm(); load()
  }
  async function delType(t: EqType) {
    const cnt = typeCount(t.id)
    if (cnt > 0) { alert(`ลบไม่ได้ — มีเครื่องมือ ${cnt} รายการในประเภทนี้ ย้ายออกก่อน`); return }
    if (!confirm(`ลบประเภท "${t.code} — ${t.name}" ?`)) return
    const res = await fetch(`/api/equipment-types/${t.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'ลบไม่สำเร็จ'); return }
    load()
  }

  const today = toDateKey(new Date())
  const rentalCount = equipment.filter(eq => eq.isRental && (!filterType || String(eq.typeId) === filterType)).length
  const filtered = equipment.filter(eq =>
    (!filterType || String(eq.typeId) === filterType) && (!hideRental || !eq.isRental))
  const of = (k: keyof typeof ownedForm) => (v: string) => setOwnedForm(p => ({ ...p, [k]: v }))
  const rf = (k: keyof typeof rentalForm) => (v: string) => setRentalForm(p => ({ ...p, [k]: v }))

  return (
    <div>
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <CustomSelect
          value={filterType}
          onChange={setFilterType}
          placeholder="ทุกประเภท"
          options={[{ value: '', label: 'ทุกประเภท' }, ...eqTypes.map(t => ({ value: String(t.id), label: `${t.code} — ${t.name}` }))]}
          className="w-64"
        />
        <button onClick={() => setHideRental(v => !v)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${hideRental ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
          {hideRental ? '👁 แสดงเครื่องเช่า' : '🙈 ซ่อนเครื่องเช่า'}{rentalCount > 0 && <span className="ml-1 opacity-70">({rentalCount})</span>}
        </button>
        <p className="text-sm text-slate-400">{filtered.length} รายการ</p>
        {role === 'MAINTENANCE' && (
          <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] text-sky-600">เปลี่ยนได้เฉพาะสถานะเครื่องมือ</span>
        )}
        {canManage && (
          <div className="ml-auto flex gap-2">
            <Btn variant="ghost" onClick={() => { resetTypeForm(); setTypeModal(true) }}>🏷 จัดการประเภท</Btn>
            <Btn onClick={() => { setEditing(null); setPhoto(null); setPhotoTouched(false); setOwnedForm({ ...initOwned, typeId: eqTypes[0] ? String(eqTypes[0].id) : '' }); setModal('add-owned') }}>+ เพิ่มเครื่องมือ (ซื้อ)</Btn>
            <Btn onClick={() => { setEditing(null); setRentalForm({ ...initRental, typeId: eqTypes[0] ? String(eqTypes[0].id) : '' }); setModal('add-rental') }}>+ เพิ่มเครื่องมือ (เช่า)</Btn>
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">ประเภท</th>
              <th className="px-4 py-2 text-left font-medium">ยี่ห้อ</th>
              <th className="px-4 py-2 text-left font-medium">รุ่น</th>
              <th className="px-4 py-2 text-left font-medium">หมายเลข</th>
              <th className="px-4 py-2 text-left font-medium">Serial</th>
              <th className="px-4 py-2 text-left font-medium">ประเภท</th>
              <th className="px-4 py-2 text-left font-medium">ระยะเช่า</th>
              <th className="px-4 py-2 text-left font-medium">สถานะ</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(eq => {
              const isExpired = eq.isRental && eq.rentalEndDate && eq.rentalEndDate.slice(0,10) < today
              return (
                <tr key={eq.id} className={`border-t border-slate-100 hover:bg-slate-50 ${eq.status === 'RETIRED' || isExpired ? 'opacity-50' : ''}`}>
                  {/* ย้ายประเภทได้จาก modal แก้ไขเท่านั้น — กันมือลั่นเปลี่ยนแล้วบันทึกทันที */}
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs text-slate-500">{eq.type.code}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{eq.brand || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2 text-slate-500">{eq.model || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => setViewing(eq)} className="font-medium text-slate-700 hover:text-emerald-700 hover:underline">{eq.internalNo ?? '—'}</button>
                  </td>
                  <td className="px-4 py-2 text-slate-400">{eq.serialNo ?? '—'}</td>
                  <td className="px-4 py-2">
                    {eq.isRental
                      ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">เช่า{eq.rentalVendor ? ` (${eq.rentalVendor})` : ''}</span>
                      : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">ซื้อ</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400">
                    {eq.isRental && eq.rentalEndDate
                      ? <span className={isExpired ? 'text-red-400 font-medium' : ''}>
                          {eq.rentalStartDate?.slice(0,10) ?? '?'} → {eq.rentalEndDate.slice(0,10)}
                          {isExpired && ' ⚠ หมดแล้ว'}
                        </span>
                      : '—'}
                  </td>
                  {/* ซ่อม/แคล มาจากใบงานเท่านั้น — แก้มือได้แค่ ACTIVE ↔ RETIRED */}
                  <td className="px-4 py-2">
                    {eq.status === 'BROKEN' || eq.status === 'CALIBRATING'
                      ? <span title="สถานะมาจากใบงาน — เปลี่ยนโดยรับกลับ/ลบใบงานในเมนู ซ่อม/Cal"
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${eq.status === 'BROKEN' ? 'bg-red-50 text-red-600' : 'bg-purple-50 text-purple-600'}`}>
                          {eq.status === 'BROKEN' ? '🔧 BROKEN' : '📐 CALIBRATING'}
                        </span>
                      : <select value={eq.status} onChange={e => changeStatus(eq, e.target.value)}
                          className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none">
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="RETIRED">RETIRED</option>
                        </select>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      {canManage && <Btn small onClick={() => openEdit(eq)}>แก้ไข</Btn>}
                      {/* ลบเครื่องซื้อ = ADMIN เท่านั้น · เครื่องเช่า = ADMIN/MANAGER */}
                      {(role === 'ADMIN' || (role === 'MANAGER' && eq.isRental)) && (
                        <Btn small variant="danger" onClick={() => del(eq)}>ลบ</Btn>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal: Add/Edit Owned */}
      {(modal === 'add-owned' || (modal === 'edit' && editing && !editing.isRental)) && (
        <Modal title={editing ? 'แก้ไขเครื่องมือ (ซื้อ)' : 'เพิ่มเครื่องมือ (ซื้อ)'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            {/* รูปเครื่องมือ */}
            <div className="flex items-center gap-3">
              {photo
                ? <img src={photo} alt="" className="h-16 w-16 rounded-lg object-cover" />
                : (editing?.hasPhoto && !photoTouched)
                  ? <img src={`/api/equipment/${editing.id}/photo`} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  : <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-2xl text-slate-300">🔧</span>}
              <div className="flex flex-col gap-1">
                <label className="cursor-pointer rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                  เลือกรูป...
                  <input type="file" accept="image/*" className="hidden" onChange={ev => onPickOwnedPhoto(ev.target.files?.[0])} />
                </label>
                {(photo || editing?.hasPhoto) && (
                  <button onClick={() => { setPhoto(null); setPhotoTouched(true) }} className="text-[11px] text-red-400 hover:text-red-600">ลบรูป</button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">ประเภทเครื่องมือ<span className="ml-0.5 text-red-500">*</span></label>
              <CustomSelect
                value={ownedForm.typeId}
                onChange={of('typeId')}
                options={eqTypes.map(t => ({ value: String(t.id), label: `${t.code} — ${t.name}` }))}
              />
            </div>
            <Input label="หมายเลขภายใน" value={ownedForm.internalNo} onChange={of('internalNo')} placeholder="TSP SP49" required />
            <Input label="Serial Number" value={ownedForm.serialNo} onChange={of('serialNo')} placeholder="SP49" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="ยี่ห้อ" value={ownedForm.brand} onChange={of('brand')} placeholder="เช่น TECORA" />
              <Input label="รุ่น" value={ownedForm.model} onChange={of('model')} placeholder="เช่น Bravo" />
            </div>
            <Input label="ผู้ขาย / Vendor" value={ownedForm.vendor} onChange={of('vendor')} placeholder="บ. ..." />
            <div className="grid grid-cols-3 gap-3">
              <Input label="วันที่ซื้อ" value={ownedForm.purchaseDate} onChange={of('purchaseDate')} type="date" />
              <Input label="ราคา (บาท)" value={ownedForm.purchasePrice} onChange={of('purchasePrice')} type="number" placeholder="0" />
              <Input label="อายุใช้งาน (ปี)" value={ownedForm.lifespanYears} onChange={of('lifespanYears')} type="number" placeholder="5" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">สถานะ</label>
              {ownedForm.status === 'BROKEN' || ownedForm.status === 'CALIBRATING'
                ? <div className="rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-500">
                    {ownedForm.status === 'BROKEN' ? '🔧 BROKEN (ส่งซ่อม)' : '📐 CALIBRATING (ส่งแคล)'} — สถานะมาจากใบงาน เปลี่ยนได้ที่เมนู ซ่อม/Cal
                  </div>
                : <CustomSelect
                    value={ownedForm.status}
                    onChange={of('status')}
                    options={[{ value: 'ACTIVE', label: 'ACTIVE' }, { value: 'RETIRED', label: 'RETIRED' }]}
                  />}
            </div>
            <Input label="หมายเหตุ" value={ownedForm.notes} onChange={of('notes')} placeholder="..." />
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setModal(null)}>ยกเลิก</Btn>
              <Btn onClick={saveOwned}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Add/Edit Rental */}
      {(modal === 'add-rental' || (modal === 'edit' && editing?.isRental)) && (
        <Modal title={editing ? 'แก้ไขเครื่องมือ (เช่า)' : 'เพิ่มเครื่องมือ (เช่า)'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">ประเภทเครื่องมือ<span className="ml-0.5 text-red-500">*</span></label>
              <CustomSelect
                value={rentalForm.typeId}
                onChange={rf('typeId')}
                options={eqTypes.map(t => ({ value: String(t.id), label: `${t.code} — ${t.name}` }))}
              />
            </div>
            <Input label="หมายเลข (ชั่วคราว)" value={rentalForm.internalNo} onChange={rf('internalNo')} placeholder="TSP เช่า No.9" required />
            <Input label="Vendor / ผู้ให้เช่า" value={rentalForm.rentalVendor} onChange={rf('rentalVendor')} placeholder="บ. ABC" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="วันที่รับมา" value={rentalForm.rentalStartDate} onChange={rf('rentalStartDate')} type="date" />
              <Input label="วันที่คืน / สิ้นสุด" value={rentalForm.rentalEndDate} onChange={rf('rentalEndDate')} type="date" required />
            </div>
            <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ⏱ เครื่องมือจะหายออกจากปฏิทินอัตโนมัติหลังวันที่คืน แต่ประวัติการใช้งานยังคงอยู่
            </div>
            <Input label="หมายเหตุ" value={rentalForm.notes} onChange={rf('notes')} placeholder="..." />
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setModal(null)}>ยกเลิก</Btn>
              <Btn onClick={saveRental}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: จัดการประเภทเครื่องมือ */}
      {typeModal && (
        <Modal title="🏷 จัดการประเภทเครื่องมือ" onClose={() => { setTypeModal(false); resetTypeForm() }}>
          <div className="space-y-4">
            {/* ฟอร์มเพิ่ม/แก้ */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-500">{editingType ? `แก้ไข: ${editingType.code}` : 'เพิ่มประเภทใหม่'}</p>
              <div className="grid grid-cols-2 gap-2">
                <Input label="โค้ด" value={typeForm.code} onChange={(v) => setTypeForm(p => ({ ...p, code: v }))} placeholder="เช่น TSP" required />
                <Input label="ชื่อ" value={typeForm.name} onChange={(v) => setTypeForm(p => ({ ...p, name: v }))} placeholder="เช่น เครื่องเก็บตัวอย่างอากาศ" required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">ทีมหลัก</label>
                <CustomSelect value={typeForm.primaryTeamId} onChange={(v) => setTypeForm(p => ({ ...p, primaryTeamId: v }))}
                  options={teams.map(t => ({ value: String(t.id), label: `${t.code} — ${t.name}` }))} />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={typeForm.requiresCal} onChange={(e) => setTypeForm(p => ({ ...p, requiresCal: e.target.checked }))} className="h-4 w-4" />
                <span>📐 ต้องส่ง Calibrate เป็นรอบ <span className="text-xs text-slate-400">(ใช้เตือน + หาเครื่องที่ยังไม่มีแผน)</span></span>
              </label>
              <div className="flex justify-end gap-2 pt-1">
                {editingType && <Btn variant="ghost" onClick={resetTypeForm}>ยกเลิกแก้</Btn>}
                <Btn onClick={saveType}>{typeSaving ? 'กำลังบันทึก...' : editingType ? 'บันทึกการแก้ไข' : '+ เพิ่มประเภท'}</Btn>
              </div>
            </div>

            {/* รายการประเภท */}
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500"><tr>
                  <th className="px-3 py-2 text-left font-medium">โค้ด</th>
                  <th className="px-3 py-2 text-left font-medium">ชื่อ</th>
                  <th className="px-3 py-2 text-left font-medium">ทีม</th>
                  <th className="px-3 py-2 text-center font-medium">Cal</th>
                  <th className="px-3 py-2 text-right font-medium">เครื่อง</th>
                  <th className="px-3 py-2" />
                </tr></thead>
                <tbody>
                  {eqTypes.length === 0 && <tr><td colSpan={6} className="px-3 py-5 text-center text-xs text-slate-300">ยังไม่มีประเภท</td></tr>}
                  {eqTypes.map(t => {
                    const cnt = typeCount(t.id)
                    return (
                      <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-xs font-medium text-slate-700">{t.code}</td>
                        <td className="px-3 py-2 text-slate-600">{t.name}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{teams.find(x => x.id === t.primaryTeamId)?.code ?? '—'}</td>
                        <td className="px-3 py-2 text-center">{t.requiresCal ? <span title="ต้องส่ง Calibrate">📐</span> : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{cnt}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Btn small onClick={() => editType(t)}>แก้</Btn>
                            <Btn small variant="danger" onClick={() => delType(t)}>ลบ</Btn>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400">ลบได้เฉพาะประเภทที่ไม่มีเครื่องมือ (คอลัมน์ "เครื่อง" = 0) — ถ้ามีเครื่องให้ย้ายประเภทออกก่อน (dropdown ประเภทในตารางเครื่องมือ)</p>
          </div>
        </Modal>
      )}

      {viewing && <EquipmentCard equipmentId={viewing.id} onClose={() => setViewing(null)} />}
    </div>
  )
}

// ── Section: Maintenance (ซ่อม/Cal) ───────────────────────────
interface EqEventRow {
  id: number; equipmentId: number; type: 'REPAIR' | 'CALIBRATION'
  sentDate: string; expectedDate: string | null; returnedDate: string | null
  nextDueDate: string | null; vendor: string | null; cost: number | null; notes: string | null
  equipment: { internalNo: string | null; serialNo: string | null; type: { code: string } }
}

function MaintenanceSection({ role }: { role?: UserRole }) {
  const [events, setEvents]       = useState<EqEventRow[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [modal, setModal]         = useState(false)
  const [returning, setReturning] = useState<EqEventRow | null>(null)
  const [editing, setEditing]     = useState<EqEventRow | null>(null)
  const [saving, setSaving]       = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const initForm = { equipmentId: '', type: 'REPAIR', sentDate: today, expectedDate: '', vendor: '', cost: '', nextDueDate: '', notes: '' }
  const [form, setForm] = useState(initForm)
  const [retForm, setRetForm] = useState({ returnedDate: today, nextDueDate: '', cost: '' })
  const [editForm, setEditForm] = useState({ returnedDate: today, nextDueDate: '', cost: '' })

  const load = useCallback(async () => {
    const [evRes, eqRes] = await Promise.all([
      fetch('/api/equipment-events').then(r => r.json()),
      fetch('/api/equipment?all=true').then(r => r.json()),
    ])
    setEvents(Array.isArray(evRes) ? evRes : [])
    setEquipment(Array.isArray(eqRes) ? eqRes : [])
  }, [])
  useEffect(() => { load() }, [load])

  const ff = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }))
  const eqLabel = (eq: Equipment) => `${eq.type.code} ${eq.internalNo ?? eq.serialNo ?? `#${eq.id}`}`

  async function save() {
    if (!form.equipmentId || !form.sentDate) return
    setSaving(true)
    await fetch('/api/equipment-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false); setModal(false); setForm(initForm); load()
  }
  function openReturn(ev: EqEventRow) {
    setRetForm({ returnedDate: today, nextDueDate: ev.nextDueDate?.slice(0, 10) ?? '', cost: ev.cost != null ? String(ev.cost) : '' })
    setReturning(ev)
  }
  const retNextMissing = returning?.type === 'CALIBRATION' && !retForm.nextDueDate
  async function confirmReturn() {
    if (!returning || retNextMissing) return
    setSaving(true)
    await fetch(`/api/equipment-events/${returning.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnedDate: retForm.returnedDate, nextDueDate: retForm.nextDueDate || null, cost: retForm.cost || null }),
    })
    setSaving(false); setReturning(null); load()
  }
  function openEdit(ev: EqEventRow) {
    setEditForm({
      returnedDate: ev.returnedDate?.slice(0, 10) ?? today,
      nextDueDate: ev.nextDueDate?.slice(0, 10) ?? '',
      cost: ev.cost != null ? String(ev.cost) : '',
    })
    setEditing(ev)
  }
  async function confirmEdit() {
    if (!editing) return
    setSaving(true)
    await fetch(`/api/equipment-events/${editing.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnedDate: editForm.returnedDate, nextDueDate: editForm.nextDueDate || null, cost: editForm.cost || null }),
    })
    setSaving(false); setEditing(null); load()
  }
  async function del(ev: EqEventRow) {
    if (!confirm('ลบใบงานนี้?')) return
    await fetch(`/api/equipment-events/${ev.id}`, { method: 'DELETE' }); load()
  }

  // กรองประเภทงาน — ช่างดูงานซ่อม / ทีมแผนดูงานแคล แยกกัน
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'REPAIR' | 'CALIBRATION'>('ALL')
  const byType = (e: EqEventRow) => typeFilter === 'ALL' || e.type === typeFilter
  const open = events.filter(e => !e.returnedDate && byType(e))
  const history = events.filter(e => e.returnedDate && byType(e))
  const overdue = (e: EqEventRow) => !e.returnedDate && e.expectedDate && e.expectedDate.slice(0, 10) < today
  const canDelete = role === 'ADMIN' || role === 'MANAGER'

  const TypeBadge = ({ t }: { t: string }) => (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t === 'REPAIR' ? 'bg-red-50 text-red-600' : 'bg-purple-50 text-purple-600'}`}>
      {t === 'REPAIR' ? '🔧 ซ่อม' : '📐 Cal'}
    </span>
  )

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {([['ALL', 'ทั้งหมด'], ['REPAIR', '🔧 ซ่อม'], ['CALIBRATION', '📐 Cal']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setTypeFilter(v)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${typeFilter === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-500">กำลังส่ง {open.length} รายการ</p>
        </div>
        <Btn onClick={() => { setForm({ ...initForm, equipmentId: equipment[0] ? String(equipment[0].id) : '' }); setModal(true) }}>+ เปิดใบงาน</Btn>
      </div>

      {/* รายการที่ยังไม่รับกลับ */}
      <div className="mb-5 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>
            <th className="px-4 py-2 text-left font-medium">เครื่องมือ</th>
            <th className="px-4 py-2 text-left font-medium">ประเภท</th>
            <th className="px-4 py-2 text-left font-medium">วันส่ง</th>
            <th className="px-4 py-2 text-left font-medium">กำหนดกลับ</th>
            <th className="px-4 py-2 text-left font-medium">Vendor</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {open.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-300">ไม่มีเครื่องที่กำลังส่งซ่อม/Cal</td></tr>}
            {open.map(ev => (
              <tr key={ev.id} className={`border-t border-slate-100 hover:bg-slate-50 ${overdue(ev) ? 'bg-red-50/40' : ''}`}>
                <td className="px-4 py-2 font-medium text-slate-700">{ev.equipment.type.code} {ev.equipment.internalNo ?? ev.equipment.serialNo}</td>
                <td className="px-4 py-2"><TypeBadge t={ev.type} /></td>
                <td className="px-4 py-2 text-xs text-slate-500">{ev.sentDate.slice(0, 10)}</td>
                <td className="px-4 py-2 text-xs">{ev.expectedDate ? <span className={overdue(ev) ? 'font-semibold text-red-500' : 'text-slate-500'}>{ev.expectedDate.slice(0, 10)}{overdue(ev) && ' ⚠ เกิน'}</span> : '—'}</td>
                <td className="px-4 py-2 text-xs text-slate-400">{ev.vendor ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1.5">
                    <Btn small onClick={() => openReturn(ev)}>รับกลับ</Btn>
                    {canDelete && <Btn small variant="danger" onClick={() => del(ev)}>ลบ</Btn>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ประวัติ */}
      <p className="mb-2 text-xs font-semibold text-slate-500">ประวัติ (รับกลับแล้ว)</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>
            <th className="px-4 py-2 text-left font-medium">เครื่องมือ</th>
            <th className="px-4 py-2 text-left font-medium">ประเภท</th>
            <th className="px-4 py-2 text-left font-medium">ส่ง → กลับ</th>
            <th className="px-4 py-2 text-left font-medium">กำหนด Cal ถัดไป</th>
            <th className="px-4 py-2 text-left font-medium">ค่าใช้จ่าย</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {history.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-300">ยังไม่มีประวัติ</td></tr>}
            {history.slice(0, 50).map(ev => (
              <tr key={ev.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-700">{ev.equipment.type.code} {ev.equipment.internalNo ?? ev.equipment.serialNo}</td>
                <td className="px-4 py-2"><TypeBadge t={ev.type} /></td>
                <td className="px-4 py-2 text-xs text-slate-500">{ev.sentDate.slice(0, 10)} → {ev.returnedDate?.slice(0, 10)}</td>
                <td className="px-4 py-2 text-xs">
                  {ev.type === 'CALIBRATION'
                    ? (ev.nextDueDate
                        ? <span className="text-purple-600">{ev.nextDueDate.slice(0, 10)}</span>
                        : <span className="text-amber-500" title="ไม่อยู่ในแผน Cal — กดแก้ไขเพื่อใส่วันที่">ไม่ระบุ ⚠</span>)
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{ev.cost != null ? `${ev.cost.toLocaleString('th-TH')} บาท` : '—'}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1.5">
                    {canDelete && <Btn small variant="ghost" onClick={() => openEdit(ev)}>แก้ไข</Btn>}
                    {canDelete && <Btn small variant="danger" onClick={() => del(ev)}>ลบ</Btn>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal เปิดใบงาน */}
      {modal && (
        <Modal title="เปิดใบงานซ่อม / Calibrate" onClose={() => setModal(false)}>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">เครื่องมือ<span className="ml-0.5 text-red-500">*</span></label>
              <CustomSelect value={form.equipmentId} onChange={ff('equipmentId')}
                options={equipment.map(eq => ({ value: String(eq.id), label: eqLabel(eq) }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">ประเภท</label>
              <CustomSelect value={form.type} onChange={ff('type')}
                options={[{ value: 'REPAIR', label: '🔧 ส่งซ่อม' }, { value: 'CALIBRATION', label: '📐 ส่ง Calibrate' }]} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="วันส่ง" value={form.sentDate} onChange={ff('sentDate')} type="date" required />
              <Input label="กำหนดกลับ/เสร็จ" value={form.expectedDate} onChange={ff('expectedDate')} type="date" />
            </div>
            {form.type === 'CALIBRATION' && (
              <Input label="กำหนด Cal ครั้งถัดไป" value={form.nextDueDate} onChange={ff('nextDueDate')} type="date" />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Vendor / ผู้รับงาน" value={form.vendor} onChange={ff('vendor')} placeholder="บ. ..." />
              <Input label="ค่าใช้จ่าย (บาท)" value={form.cost} onChange={ff('cost')} type="number" placeholder="0" />
            </div>
            <Input label="หมายเหตุ" value={form.notes} onChange={ff('notes')} placeholder="อาการ / รายละเอียด" />
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setModal(false)}>ยกเลิก</Btn>
              <Btn onClick={save}>{saving ? 'กำลังบันทึก...' : 'เปิดใบงาน'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal รับกลับ */}
      {returning && (
        <Modal title="รับเครื่องกลับ" onClose={() => setReturning(null)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{returning.equipment.type.code} {returning.equipment.internalNo ?? returning.equipment.serialNo} · <TypeBadge t={returning.type} /></p>
            <Input label="วันรับกลับ" value={retForm.returnedDate} onChange={v => setRetForm(p => ({ ...p, returnedDate: v }))} type="date" required />
            {returning.type === 'CALIBRATION' && (
              <div>
                <Input label="กำหนด Cal ครั้งถัดไป" value={retForm.nextDueDate} onChange={v => setRetForm(p => ({ ...p, nextDueDate: v }))} type="date" required />
                {retNextMissing && <p className="mt-1 text-xs text-red-500">ต้องระบุกำหนด Cal ครั้งถัดไป เพื่อให้เครื่องอยู่ในแผน Cal</p>}
              </div>
            )}
            <Input label="ค่าใช้จ่าย (บาท)" value={retForm.cost} onChange={v => setRetForm(p => ({ ...p, cost: v }))} type="number" placeholder="0" />
            <div className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-700">รับกลับแล้วเครื่องจะกลับสู่สถานะ "พร้อมใช้" อัตโนมัติ</div>
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setReturning(null)}>ยกเลิก</Btn>
              <Btn onClick={confirmReturn} disabled={saving || retNextMissing}>{saving ? 'กำลังบันทึก...' : 'ยืนยันรับกลับ'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal แก้ไขประวัติ (แก้วันรับกลับ / กำหนด Cal ถัดไป / ค่าใช้จ่าย) */}
      {editing && (
        <Modal title="แก้ไขประวัติซ่อม/Cal" onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{editing.equipment.type.code} {editing.equipment.internalNo ?? editing.equipment.serialNo} · <TypeBadge t={editing.type} /></p>
            <Input label="วันรับกลับ" value={editForm.returnedDate} onChange={v => setEditForm(p => ({ ...p, returnedDate: v }))} type="date" required />
            {editing.type === 'CALIBRATION' && (
              <div>
                <Input label="กำหนด Cal ครั้งถัดไป" value={editForm.nextDueDate} onChange={v => setEditForm(p => ({ ...p, nextDueDate: v }))} type="date" />
                <p className="mt-1 text-xs text-slate-400">เว้นว่าง = นำเครื่องออกจากแผน Cal</p>
              </div>
            )}
            <Input label="ค่าใช้จ่าย (บาท)" value={editForm.cost} onChange={v => setEditForm(p => ({ ...p, cost: v }))} type="number" placeholder="0" />
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setEditing(null)}>ยกเลิก</Btn>
              <Btn onClick={confirmEdit} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Section: Calibration annual plan ──────────────────────────
const CAL_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

// อ่าน ปี/เดือน จาก ISO string ตรงๆ — กัน timezone ทำให้เดือนเพี้ยน (ค่าใน DB เป็น @db.Date)
const isoYear  = (s: string) => parseInt(s.slice(0, 4))
const isoMonth = (s: string) => parseInt(s.slice(5, 7)) - 1
const thShort  = (s: string) => `${parseInt(s.slice(8, 10))} ${CAL_MONTHS[isoMonth(s)]}`

interface CalEventRow {
  id: number; equipmentId: number; sentDate: string; expectedDate: string | null
  returnedDate: string | null; nextDueDate: string | null; vendor: string | null; cost: number | null; notes: string | null
}

// tooltip ของสัญลักษณ์ "ส่งจริง"
function calEventTip(e: CalEventRow): string {
  const lines = [
    e.returnedDate
      ? `ส่ง ${thShort(e.sentDate)} → รับกลับ ${thShort(e.returnedDate)}`
      : `ส่ง ${thShort(e.sentDate)} — อยู่ระหว่างส่งแคล${e.expectedDate ? ` (กำหนดเสร็จ ${thShort(e.expectedDate)})` : ''}`,
  ]
  if (e.vendor)      lines.push(`ศูนย์: ${e.vendor}`)
  if (e.cost != null) lines.push(`ค่าใช้จ่าย: ${e.cost.toLocaleString('th-TH')} บาท`)
  if (e.nextDueDate) lines.push(`กำหนดถัดไป: ${thShort(e.nextDueDate)} ${isoYear(e.nextDueDate) + 543}`)
  if (e.notes)       lines.push(e.notes)
  return lines.join('\n')
}

function CalPlanSection({ role }: { role?: UserRole }) {
  const canEdit = role === 'ADMIN' || role === 'MANAGER'
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [eqTypes,   setEqTypes]   = useState<EqType[]>([])
  const [events,    setEvents]    = useState<CalEventRow[]>([])
  const [year,      setYear]      = useState(new Date().getFullYear())
  const [filterType, setFilterType] = useState('')

  // modal ตั้ง/แก้แผน
  const [planModal, setPlanModal] = useState<null | { mode: 'add' | 'edit'; eqId: string }>(null)
  const [planDate,  setPlanDate]  = useState('')
  const [saving,    setSaving]    = useState(false)

  // ใบงาน Cal 2 ชุด: (1) ที่ส่งในปีที่เลือก = เอามาวาด  (2) ที่ยังเปิดค้าง = ใช้ตัดสิน "เกินกำหนด" (อาจส่งข้ามปี)
  const load = useCallback(async () => {
    const [eRes, tRes, evRes, openRes] = await Promise.all([
      fetch('/api/equipment?all=true').then(r => r.json()),
      fetch('/api/equipment-types').then(r => r.json()),
      fetch(`/api/equipment-events?type=CALIBRATION&year=${year}`).then(r => r.json()),
      fetch('/api/equipment-events?type=CALIBRATION&status=open').then(r => r.json()),
    ])
    setEquipment(Array.isArray(eRes) ? eRes : [])
    setEqTypes(Array.isArray(tRes) ? tRes : [])
    const merged = new Map<number, CalEventRow>()
    for (const ev of [...(Array.isArray(evRes) ? evRes : []), ...(Array.isArray(openRes) ? openRes : [])]) merged.set(ev.id, ev)
    setEvents(Array.from(merged.values()))
  }, [year])
  useEffect(() => { load() }, [load])

  const todayKey = new Date().toISOString().slice(0, 10)
  const eqName = (eq: Equipment) => eq.internalNo ?? eq.serialNo ?? `#${eq.id}`

  const byEq = new Map<number, CalEventRow[]>()
  for (const ev of events) {
    if (!byEq.has(ev.equipmentId)) byEq.set(ev.equipmentId, [])
    byEq.get(ev.equipmentId)!.push(ev)
  }

  // แถวในปีนี้ = มีกำหนดครบในปีนี้ "หรือ" มีใบงานส่งจริงในปีนี้
  interface Row { eq: Equipment; dueMonth: number | null; overdue: boolean; sent: CalEventRow[] }
  const rows: Row[] = []
  for (const eq of equipment) {
    if (eq.status === 'RETIRED') continue
    if (filterType && String(eq.typeId) !== filterType) continue
    const evs     = byEq.get(eq.id) ?? []
    const sent    = evs.filter(e => isoYear(e.sentDate) === year).sort((a, b) => a.sentDate.localeCompare(b.sentDate))
    const hasOpen = evs.some(e => !e.returnedDate)
    const dueThisYear = eq.calDueDate && isoYear(eq.calDueDate) === year
    if (!dueThisYear && sent.length === 0) continue
    rows.push({
      eq,
      dueMonth: dueThisYear ? isoMonth(eq.calDueDate!) : null,
      overdue:  !!dueThisYear && eq.calDueDate!.slice(0, 10) < todayKey && !hasOpen,
      sent,
    })
  }

  // group by type
  const groups = new Map<number, { type: EqType; items: Row[] }>()
  for (const row of rows) {
    const t = eqTypes.find(x => x.id === row.eq.typeId)
    if (!t) continue
    if (!groups.has(row.eq.typeId)) groups.set(row.eq.typeId, { type: t, items: [] })
    groups.get(row.eq.typeId)!.items.push(row)
  }
  const groupArr = Array.from(groups.values())

  // สรุปต่อเดือน + ชิป
  const monthDue  = Array(12).fill(0) as number[]
  const monthSent = Array(12).fill(0) as number[]
  for (const row of rows) {
    if (row.dueMonth != null) monthDue[row.dueMonth]++
    for (const e of row.sent) monthSent[isoMonth(e.sentDate)]++
  }
  const sentCount    = rows.reduce((n, r) => n + r.sent.length, 0)
  const waitingCount = rows.reduce((n, r) => n + r.sent.filter(e => !e.returnedDate).length, 0)
  const overdueCount = rows.filter(r => r.overdue).length

  // เครื่องที่ "ต้อง Cal" แต่ยังไม่มีทั้งแผนและใบงานเปิด (ช่องโหว่)
  const noPlan = equipment.filter(eq => {
    if (eq.status === 'RETIRED') return false
    if (filterType && String(eq.typeId) !== filterType) return false
    const t = eqTypes.find(x => x.id === eq.typeId)
    if (!t?.requiresCal) return false
    if (eq.calDueDate) return false
    return !(byEq.get(eq.id) ?? []).some(e => !e.returnedDate)
  })

  async function savePlan() {
    if (!planModal || !planDate) return
    setSaving(true)
    const res = await fetch(`/api/equipment/${planModal.eqId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calDueDate: planDate }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'บันทึกไม่สำเร็จ'); return }
    setPlanModal(null); load()
  }
  async function removePlan(eq: Equipment) {
    if (!confirm(`เอา ${eqName(eq)} ออกจากแผน Cal?`)) return
    const res = await fetch(`/api/equipment/${eq.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calDueDate: null }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'ลบไม่สำเร็จ'); return }
    load()
  }
  function openAdd(eqId = '')  { setPlanDate(''); setPlanModal({ mode: 'add', eqId }) }
  function openEdit(eq: Equipment) { setPlanDate(eq.calDueDate?.slice(0, 10) ?? ''); setPlanModal({ mode: 'edit', eqId: String(eq.id) }) }

  const Chip = ({ color, children }: { color: string; children: React.ReactNode }) => (
    <span className={`rounded-full border px-2.5 py-1 text-xs ${color}`}>{children}</span>
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
          <button onClick={() => setYear(y => y - 1)} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">‹</button>
          <span className="min-w-[70px] text-center text-sm font-medium text-slate-700">ปี {year + 543}</span>
          <button onClick={() => setYear(y => y + 1)} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">›</button>
        </div>
        <CustomSelect value={filterType} onChange={setFilterType} placeholder="ทุกหมวด" className="w-52"
          options={[{ value: '', label: 'ทุกหมวด' }, ...eqTypes.map(t => ({ value: String(t.id), label: `${t.code} — ${t.name}` }))]} />
        <Chip color="border-slate-200 bg-white text-slate-500">{rows.length} เครื่องในปีนี้</Chip>
        {sentCount > 0 && <Chip color="border-emerald-200 bg-emerald-50 text-emerald-700">ส่งแล้ว {sentCount}</Chip>}
        {waitingCount > 0 && <Chip color="border-amber-200 bg-amber-50 text-amber-700">อยู่ระหว่างส่งแคล {waitingCount}</Chip>}
        {overdueCount > 0 && <Chip color="border-red-200 bg-red-50 text-red-600">เกินกำหนด {overdueCount}</Chip>}
        {canEdit && <div className="ml-auto"><Btn onClick={() => openAdd()}>+ เพิ่มแผนแคล</Btn></div>}
      </div>

      {groupArr.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-300">ยังไม่มีเครื่องที่มีแผน Cal หรือส่ง Cal ในปีนี้<br /><span className="text-xs">กด &quot;+ เพิ่มแผนแคล&quot; เพื่อกำหนดวัน หรือกำหนดอัตโนมัติได้ตอนรับเครื่องกลับในเมนู ซ่อม/Cal</span></p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-medium min-w-[150px]">เครื่องมือ</th>
                {CAL_MONTHS.map((m, i) => (
                  <th key={m} className="border-l border-slate-100 px-1 py-2 text-center font-medium min-w-[46px]">
                    {m}
                    {(monthDue[i] > 0 || monthSent[i] > 0) && (
                      <div className="flex justify-center gap-1 text-[9px] font-normal">
                        {monthDue[i]  > 0 && <span className="text-violet-500">{monthDue[i]}</span>}
                        {monthSent[i] > 0 && <span className="text-emerald-600">{monthSent[i]}</span>}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupArr.map(({ type, items }) => (
                <Fragment key={`g-${type.id}`}>
                  <tr>
                    <td colSpan={13} className="border-t border-slate-200 bg-slate-100 px-3 py-1 font-semibold text-slate-500">{type.code} — {type.name}</td>
                  </tr>
                  {items.map(row => (
                    <tr key={row.eq.id} className="group border-t border-slate-100 hover:bg-slate-50">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-slate-700">
                        <div className="flex items-center justify-between gap-1">
                          <span>{eqName(row.eq)}</span>
                          {canEdit && row.eq.calDueDate && (
                            <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button onClick={() => openEdit(row.eq)} title="แก้วันแผน" className="text-[11px] text-slate-400 hover:text-slate-700">✎</button>
                              <button onClick={() => removePlan(row.eq)} title="เอาออกจากแผน" className="text-[11px] text-slate-400 hover:text-red-600">✕</button>
                            </span>
                          )}
                        </div>
                      </td>
                      {CAL_MONTHS.map((_, i) => {
                        const inMonth = row.sent.filter(e => isoMonth(e.sentDate) === i)
                        return (
                          <td key={i} className="border-l border-slate-100 px-1 py-1.5 text-center">
                            <span className="inline-flex items-center justify-center gap-0.5">
                              {row.dueMonth === i && (
                                <span title={`${row.overdue ? 'เกินกำหนด — ' : ''}กำหนดครบ Cal ${thShort(row.eq.calDueDate!)}`}
                                  className={`inline-block h-2.5 w-2.5 rounded-full ${row.overdue ? 'bg-red-500' : 'bg-violet-500'}`} />
                              )}
                              {inMonth.map(e => e.returnedDate ? (
                                <span key={e.id} title={calEventTip(e)} className="text-[11px] font-bold leading-none text-emerald-600">✓</span>
                              ) : (
                                <span key={e.id} title={calEventTip(e)} className="inline-block h-2.5 w-2.5 rounded-full border-2 border-amber-500" />
                              ))}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span><span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-500 align-middle" /> กำหนดครบ Cal (แผน)</span>
        <span><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-amber-500 align-middle" /> อยู่ระหว่างส่งแคล</span>
        <span><span className="font-bold text-emerald-600">✓</span> ส่งและรับกลับแล้ว</span>
        <span><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 align-middle" /> เกินกำหนด (ยังไม่ส่ง)</span>
        <span className="text-slate-300">ตัวเลขใต้เดือน = ครบกำหนด (ม่วง) / ส่งจริง (เขียว)</span>
      </div>

      {/* เครื่องที่ต้อง Cal แต่ยังไม่มีแผน */}
      {noPlan.length > 0 && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <p className="mb-2 text-xs font-semibold text-amber-700">⚠ เครื่องที่ต้อง Cal แต่ยังไม่มีแผน ({noPlan.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {noPlan.map(eq => {
              const t = eqTypes.find(x => x.id === eq.typeId)
              return (
                <button key={eq.id} onClick={() => canEdit && openAdd(String(eq.id))} disabled={!canEdit}
                  className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-amber-100 disabled:cursor-default disabled:hover:bg-white">
                  {t?.code} {eqName(eq)} {canEdit && <span className="text-amber-500">+ ตั้งแผน</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal เพิ่ม/แก้แผน */}
      {planModal && (
        <Modal title={planModal.mode === 'edit' ? '✎ แก้วันแผน Cal' : '+ เพิ่มแผนแคล'} onClose={() => setPlanModal(null)}>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">เครื่องมือ<span className="ml-0.5 text-red-500">*</span></label>
              <SearchableSelect value={planModal.eqId} onChange={(v) => setPlanModal(m => m && { ...m, eqId: v })}
                disabled={planModal.mode === 'edit'} placeholder="พิมพ์ค้นหาเครื่อง..."
                options={equipment.filter(eq => eq.status !== 'RETIRED').map(eq => {
                  const t = eqTypes.find(x => x.id === eq.typeId)
                  return { value: String(eq.id), label: `${t?.code ?? ''} ${eqName(eq)}` }
                })} />
            </div>
            <Input label="กำหนดครบ Cal (วันที่)" value={planDate} onChange={setPlanDate} type="date" required />
            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setPlanModal(null)}>ยกเลิก</Btn>
              <Btn onClick={savePlan} disabled={saving || !planModal.eqId || !planDate}>{saving ? 'กำลังบันทึก...' : 'บันทึกแผน'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Section: Vehicles (รถ) ────────────────────────────────────
interface VehicleRow {
  id: number; licensePlate: string; name: string | null; vehicleType: string | null
  brand: string | null; model: string | null; seats: number | null; status: string; notes: string | null; hasPhoto?: boolean
}
const VEHICLE_STATUS = ['ACTIVE', 'MAINTENANCE', 'RETIRED'] as const
const VSTATUS_LABEL: Record<string, string> = { ACTIVE: 'พร้อมใช้', MAINTENANCE: 'ซ่อมบำรุง', RETIRED: 'ปลดระวาง' }

function VehiclesSection({ role }: { role?: UserRole }) {
  const canManage = role === 'ADMIN' || role === 'MANAGER'
  const [vehicles, setVehicles] = useState<VehicleRow[]>([])
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<VehicleRow | null>(null)
  const init = { licensePlate: '', name: '', vehicleType: '', brand: '', model: '', seats: '', status: 'ACTIVE', notes: '' }
  const [form, setForm] = useState(init)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoTouched, setPhotoTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewing, setViewing] = useState<VehicleRow | null>(null)
  const [logbook, setLogbook] = useState<VehicleRow | null>(null)  // สมุดไมล์รายคัน
  const [summary, setSummary] = useState(false)                    // สรุปไมล์ทุกคัน

  const load = useCallback(async () => {
    const r = await fetch('/api/vehicles?all=true'); if (r.ok) setVehicles(await r.json())
  }, [])
  useEffect(() => { load() }, [load])

  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }))
  function openAdd() { setForm(init); setPhoto(null); setPhotoTouched(false); setEditing(null); setModal('add') }
  function openEdit(v: VehicleRow) {
    setForm({ licensePlate: v.licensePlate, name: v.name ?? '', vehicleType: v.vehicleType ?? '', brand: v.brand ?? '', model: v.model ?? '', seats: v.seats != null ? String(v.seats) : '', status: v.status, notes: v.notes ?? '' })
    setPhoto(null); setPhotoTouched(false); setEditing(v); setModal('edit')
  }
  async function onPickPhoto(file?: File) { if (!file) return; setPhoto(await resizeImage(file)); setPhotoTouched(true) }
  async function save() {
    if (!form.licensePlate) return
    setSaving(true)
    const body: Record<string, unknown> = { ...form }
    if (photoTouched) body.photoUrl = photo
    if (modal === 'add') await fetch('/api/vehicles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    else if (editing) await fetch(`/api/vehicles/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false); setModal(null); load()
  }
  async function changeStatus(v: VehicleRow, status: string) {
    await fetch(`/api/vehicles/${v.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licensePlate: v.licensePlate, name: v.name, vehicleType: v.vehicleType, brand: v.brand, model: v.model, seats: v.seats, status, notes: v.notes }) })
    load()
  }
  async function del(v: VehicleRow) {
    if (!confirm(`ลบรถ "${v.licensePlate}" ? ประวัติการจองจะถูกลบด้วย`)) return
    await fetch(`/api/vehicles/${v.id}`, { method: 'DELETE' }); load()
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-400">{vehicles.length} คัน</p>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setSummary(true)}>📊 สรุป/Export ไมล์รถ</Btn>
          {canManage && <Btn onClick={openAdd}>+ เพิ่มรถ</Btn>}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>
            <th className="px-4 py-2 text-left font-medium">ทะเบียน</th>
            <th className="px-4 py-2 text-left font-medium">ชื่อ/ประเภท</th>
            <th className="px-4 py-2 text-left font-medium">ที่นั่ง</th>
            <th className="px-4 py-2 text-left font-medium">สถานะ</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {vehicles.map(v => (
              <tr key={v.id} className={`border-t border-slate-100 hover:bg-slate-50 ${v.status === 'RETIRED' ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2">
                  <button onClick={() => setViewing(v)} className="flex items-center gap-2 text-left hover:text-emerald-700">
                    {v.hasPhoto ? <img src={`/api/vehicles/${v.id}/photo`} alt="" className="h-7 w-7 rounded object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-100 text-sm">🚗</span>}
                    <span className="font-medium text-slate-700">{v.licensePlate}</span>
                  </button>
                </td>
                <td className="px-4 py-2 text-slate-500">{[v.name, v.vehicleType, v.brand].filter(Boolean).join(' · ') || '—'}</td>
                <td className="px-4 py-2 text-slate-500">{v.seats ?? '—'}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    {canManage
                      ? <select value={v.status} onChange={e => changeStatus(v, e.target.value)} className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none">
                          {VEHICLE_STATUS.map(s => <option key={s} value={s}>{VSTATUS_LABEL[s]}</option>)}
                        </select>
                      : <span className="text-xs text-slate-500">{VSTATUS_LABEL[v.status]}</span>}
                    <button onClick={() => setLogbook(v)} className="whitespace-nowrap rounded border border-slate-200 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50">📊 ไมล์รถ</button>
                  </div>
                </td>
                <td className="px-4 py-2 text-right">
                  {canManage && <div className="flex justify-end gap-1.5">
                    <Btn small onClick={() => openEdit(v)}>แก้ไข</Btn>
                    {role === 'ADMIN' && <Btn small variant="danger" onClick={() => del(v)}>ลบ</Btn>}
                  </div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? 'เพิ่มรถ' : 'แก้ไขรถ'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {photo ? <img src={photo} alt="" className="h-16 w-16 rounded-lg object-cover" />
                : (editing?.hasPhoto && !photoTouched) ? <img src={`/api/vehicles/${editing.id}/photo`} alt="" className="h-16 w-16 rounded-lg object-cover" />
                : <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-2xl text-slate-300">🚗</span>}
              <div className="flex flex-col gap-1">
                <label className="cursor-pointer rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">เลือกรูป...
                  <input type="file" accept="image/*" className="hidden" onChange={ev => onPickPhoto(ev.target.files?.[0])} />
                </label>
                {(photo || editing?.hasPhoto) && <button onClick={() => { setPhoto(null); setPhotoTouched(true) }} className="text-[11px] text-red-400 hover:text-red-600">ลบรูป</button>}
              </div>
            </div>
            <Input label="ทะเบียน" value={form.licensePlate} onChange={f('licensePlate')} placeholder="กข 1234 ขอนแก่น" required />
            <Input label="ชื่อเรียก/รหัสภายใน" value={form.name} onChange={f('name')} placeholder="รถตู้ 1" />
            <div className="grid grid-cols-3 gap-3">
              <Input label="ประเภท" value={form.vehicleType} onChange={f('vehicleType')} placeholder="กระบะ/ตู้/เก๋ง" />
              <Input label="ยี่ห้อ" value={form.brand} onChange={f('brand')} placeholder="Toyota" />
              <Input label="ที่นั่ง" value={form.seats} onChange={f('seats')} type="number" placeholder="4" />
            </div>
            <Input label="รุ่น" value={form.model} onChange={f('model')} placeholder="Hilux Revo" />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">สถานะ</label>
              <CustomSelect value={form.status} onChange={f('status')} options={VEHICLE_STATUS.map(s => ({ value: s, label: VSTATUS_LABEL[s] }))} />
            </div>
            <Input label="หมายเหตุ" value={form.notes} onChange={f('notes')} placeholder="..." />
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setModal(null)}>ยกเลิก</Btn>
              <Btn onClick={save}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {viewing && <VehicleCard vehicleId={viewing.id} onClose={() => setViewing(null)} />}
      {logbook && <VehicleLogbook vehicleId={logbook.id} plate={logbook.licensePlate} onClose={() => setLogbook(null)} />}
      {summary && <VehicleLogbook onClose={() => setSummary(false)} />}
    </div>
  )
}

// ── Section: Holidays (วันหยุดพิเศษ) ──────────────────────────
interface HolidayRow { id: number; date: string; name: string }

function HolidaysSection() {
  const [holidays, setHolidays] = useState<HolidayRow[]>([])
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/holidays'); if (r.ok) setHolidays(await r.json())
  }, [])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!date || !name) return
    setSaving(true)
    await fetch('/api/holidays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, name }) })
    setSaving(false); setDate(''); setName(''); load()
  }
  async function del(h: HolidayRow) {
    if (!confirm(`ลบวันหยุด "${h.name}" ?`)) return
    await fetch(`/api/holidays/${h.id}`, { method: 'DELETE' }); load()
  }
  const fmt = (d: string) => new Date(d).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">วันที่</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:outline-none" />
        </div>
        <div className="flex flex-1 flex-col gap-1 min-w-[180px]">
          <label className="text-xs font-medium text-slate-600">ชื่อวันหยุด</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น วันสงกรานต์"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:outline-none" />
        </div>
        <Btn onClick={add}>{saving ? 'กำลังเพิ่ม...' : '+ เพิ่มวันหยุด'}</Btn>
      </div>
      <p className="mb-2 text-xs text-slate-400">
        วันอาทิตย์เป็นวันหยุดประจำสัปดาห์อยู่แล้ว — เพิ่มเฉพาะวันหยุดพิเศษ (นักขัตฤกษ์/หยุดบริษัท) ระบบจะหักออกจากวันทำงานในการคำนวณ Utilization
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>
            <th className="px-4 py-2 text-left font-medium">วันที่</th>
            <th className="px-4 py-2 text-left font-medium">ชื่อ</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {holidays.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-300">ยังไม่มีวันหยุดพิเศษ</td></tr>}
            {holidays.map(h => (
              <tr key={h.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-700">⛱ {fmt(h.date)}</td>
                <td className="px-4 py-2 text-slate-600">{h.name}</td>
                <td className="px-4 py-2 text-right"><Btn small variant="danger" onClick={() => del(h)}>ลบ</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Section: Users (ADMIN เท่านั้น) ───────────────────────────
type CemsRoleValue = 'NONE' | 'USER' | 'ADMIN'
const CEMS_ROLE_ORDER: CemsRoleValue[] = ['NONE', 'USER', 'ADMIN']
const CEMS_ROLE_LABEL: Record<CemsRoleValue, string> = {
  NONE:  '— ไม่มีสิทธิ์',
  USER:  'CEMS User',      // ดู + บันทึกงาน (เบิก/สถานะ/ความดัน)
  ADMIN: 'CEMS Admin',     // อนุมัติ + ลบ + จัดการทะเบียน/แผน
}

interface UserRow {
  id: number; username: string; role: UserRole; isActive: boolean; cemsRole: CemsRoleValue
  employeeId: number | null; employeeName: string | null; fullName: string | null; team: string | null
}

function UsersSection({ myUid }: { myUid?: number }) {
  const [users, setUsers]   = useState<UserRow[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    const [uRes, eRes] = await Promise.all([fetch('/api/users'), fetch('/api/employees?all=true')])
    if (uRes.ok) setUsers(await uRes.json())
    if (eRes.ok) setEmployees(await eRes.json())
  }, [])
  useEffect(() => { load() }, [load])

  async function delUser(u: UserRow) {
    if (!confirm(`ลบบัญชี "${u.username}" ?`)) return
    const r = await fetch(`/api/users/${u.id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? 'ลบไม่สำเร็จ'); return }
    load()
  }

  async function patch(u: UserRow, body: Record<string, unknown>) {
    const r = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? 'ทำรายการไม่สำเร็จ'); return }
    load()
  }

  async function resetPw(u: UserRow) {
    const pw = prompt(`ตั้งรหัสผ่านใหม่ของ "${u.username}"`, '4321')
    if (!pw) return
    await patch(u, { resetPassword: pw })
    alert(`รีเซ็ตรหัสผ่าน ${u.username} แล้ว`)
  }

  async function renameUser(u: UserRow) {
    const name = prompt(`เปลี่ยน username ของ "${u.username}"`, u.username)
    if (name == null) return
    const clean = name.trim().toLowerCase()
    if (!clean || clean === u.username) return
    await patch(u, { username: clean })
  }

  const filtered = users.filter(u =>
    !search || u.username.includes(search) || (u.employeeName ?? '').includes(search) || (u.fullName ?? '').includes(search))

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา username / ชื่อ..."
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm focus:outline-none" />
        <p className="text-sm text-slate-400">{filtered.length} บัญชี</p>
        <Btn onClick={() => setAddOpen(true)}>+ เพิ่มผู้ใช้</Btn>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Username</th>
              <th className="px-4 py-2 text-left font-medium">ชื่อ</th>
              <th className="px-4 py-2 text-left font-medium">ทีม</th>
              <th className="px-4 py-2 text-left font-medium">สิทธิ์</th>
              <th className="px-4 py-2 text-left font-medium">CEMS</th>
              <th className="px-4 py-2 text-left font-medium">สถานะ</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} className={`border-t border-slate-100 hover:bg-slate-50 ${!u.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2 font-mono font-medium text-slate-700">
                  <button onClick={() => renameUser(u)} title="คลิกเพื่อแก้ไข username" className="hover:text-emerald-700 hover:underline">{u.username}</button>
                  {u.id === myUid && <span className="ml-1 text-[10px] text-sky-500">(คุณ)</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{u.employeeName ?? '—'}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{u.team ?? '—'}</td>
                <td className="px-4 py-2 w-44">
                  <CustomSelect value={u.role} onChange={(v) => patch(u, { role: v })}
                    options={ROLE_ORDER.map(r => ({ value: r, label: ROLE_LABEL[r] }))} />
                </td>
                <td className="px-4 py-2 w-40">
                  {u.role === 'ADMIN'
                    ? <span className="text-[10px] text-slate-400">CEMS Admin (เสมอ)</span>
                    : <CustomSelect value={u.cemsRole ?? 'NONE'} onChange={(v) => patch(u, { cemsRole: v })}
                        options={CEMS_ROLE_ORDER.map(r => ({ value: r, label: CEMS_ROLE_LABEL[r] }))} />}
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => patch(u, { isActive: !u.isActive })}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${u.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                    {u.isActive ? 'ใช้งาน' : 'ปิด'}
                  </button>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1.5">
                    <Btn small variant="ghost" onClick={() => resetPw(u)}>รีเซ็ตรหัส</Btn>
                    {u.id !== myUid && <Btn small variant="danger" onClick={() => delUser(u)}>ลบ</Btn>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addOpen && <AddUserModal
        employees={employees.filter(e => !users.some(u => u.employeeId === e.id))}
        onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load() }} />}
    </div>
  )
}

// ── Modal: เพิ่มผู้ใช้ ────────────────────────────────────────
function AddUserModal({ employees, onClose, onSaved }: { employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ username: '', password: '', role: 'GENERAL' as UserRole, cemsRole: 'NONE' as CemsRoleValue, employeeId: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    if (!form.username || !form.password) { setErr('กรอก username และรหัสผ่าน'); return }
    setSaving(true); setErr('')
    const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'สร้างไม่สำเร็จ'); return }
    onSaved()
  }

  return (
    <Modal title="+ เพิ่มผู้ใช้" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">ผูกกับพนักงาน (ไม่บังคับ)</label>
          <CustomSelect value={form.employeeId} onChange={(v) => {
            const emp = employees.find(e => String(e.id) === v)
            // เดา username จากชื่อเล่นถ้ายังว่าง
            setForm(p => ({ ...p, employeeId: v, username: p.username || (emp?.nickname ? emp.nickname.toLowerCase() : p.username) }))
          }}
            options={[{ value: '', label: '— ไม่ผูกพนักงาน (บัญชีกลาง) —' },
              ...employees.map(e => ({ value: String(e.id), label: `${e.nickname ? e.nickname + ' · ' : ''}${e.fullName}` }))]} />
          <p className="text-[11px] text-slate-400">แสดงเฉพาะพนักงานที่ยังไม่มีบัญชี</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Username" value={form.username} onChange={f('username')} placeholder="เช่น somchai" required />
          <Input label="รหัสผ่าน" value={form.password} onChange={f('password')} placeholder="อย่างน้อย 4 ตัว" required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">สิทธิ์ (Role)</label>
          <CustomSelect value={form.role} onChange={(v) => setForm(p => ({ ...p, role: v as UserRole }))}
            options={ROLE_ORDER.map(r => ({ value: r, label: ROLE_LABEL[r] }))} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">สิทธิ์โมดูล CEMS</label>
          <CustomSelect value={form.cemsRole} onChange={(v) => setForm(p => ({ ...p, cemsRole: v as CemsRoleValue }))}
            options={CEMS_ROLE_ORDER.map(r => ({ value: r, label: CEMS_ROLE_LABEL[r] }))} />
          <p className="text-[11px] text-slate-400">User = ดู+บันทึกงาน · Admin = อนุมัติเบิก/ลบ/จัดการทะเบียน-แผน (ผู้ดูแลระบบเป็น CEMS Admin เสมอ)</p>
        </div>
        {err && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>ยกเลิก</Btn>
          <Btn onClick={save}>{saving ? 'กำลังสร้าง...' : 'สร้างบัญชี'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ── Main AdminView ─────────────────────────────────────────────
type AdminTab = 'sites' | 'employees' | 'equipment' | 'vehicles' | 'maintenance' | 'calplan' | 'holidays' | 'users'

export default function AdminView() {
  const { me, role } = useMe()
  const [tab, setTab] = useState<AdminTab>('sites')

  const allTabs: { key: AdminTab; label: string; roles: UserRole[] }[] = [
    { key: 'sites',     label: '🏭 ไซต์งาน',  roles: ['ADMIN', 'MANAGER'] },
    { key: 'employees', label: '👤 พนักงาน',   roles: ['ADMIN', 'MANAGER'] },
    { key: 'equipment',   label: '🔧 เครื่องมือ', roles: ['ADMIN', 'MANAGER', 'MAINTENANCE'] },
    { key: 'vehicles',    label: '🚗 รถ',         roles: ['ADMIN', 'MANAGER'] },
    { key: 'maintenance', label: '🛠 ซ่อม/Cal',  roles: ['ADMIN', 'MANAGER', 'MAINTENANCE'] },
    { key: 'calplan',     label: '📐 แผน Cal',   roles: ['ADMIN', 'MANAGER', 'MAINTENANCE'] },
    { key: 'holidays',    label: '⛱ วันหยุด',    roles: ['ADMIN', 'MANAGER'] },
    { key: 'users',     label: '🔑 ผู้ใช้งาน',  roles: ['ADMIN'] },
  ]
  const tabs   = allTabs.filter(t => !role || t.roles.includes(role))
  const active = tabs.find(t => t.key === tab)?.key ?? tabs[0]?.key

  return (
    <div className="h-full overflow-auto bg-slate-50 p-6">
      <h1 className="mb-5 text-xl font-bold text-slate-800">⚙️ จัดการข้อมูล</h1>

      <div className="mb-5 flex gap-1 rounded-xl bg-slate-200 p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${active === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
        {active === 'sites'     && <SitesSection />}
        {active === 'employees' && <EmployeesSection />}
        {active === 'equipment'   && <EquipmentSection role={role} />}
        {active === 'vehicles'    && <VehiclesSection role={role} />}
        {active === 'maintenance' && <MaintenanceSection role={role} />}
        {active === 'calplan'     && <CalPlanSection role={role} />}
        {active === 'holidays'    && <HolidaysSection />}
        {active === 'users'     && <UsersSection myUid={me?.uid} />}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { SITE_COLOR_OPTIONS } from '@/lib/siteColors'
import { useMe } from '@/hooks/useMe'
import { ROLE_LABEL, ROLE_ORDER, type UserRole } from '@/lib/roles'
import { toDateKey } from '@/lib/dateKey'
import Avatar from '@/components/Avatar'
import EmployeeCard from '@/components/EmployeeCard'
import EquipmentCard from '@/components/EquipmentCard'

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
interface EqType   { id: number; code: string; name: string; primaryTeamId: number }
interface Employee {
  id: number; fullName: string; nickname: string | null; primaryTeamId: number; primaryTeam: Team; isActive: boolean
  hasPhoto?: boolean; birthDate?: string | null; startDate?: string | null; eduField?: string | null; eduInstitute?: string | null
}
interface Site     { id: number; code: string; name: string; clientName: string | null; province: string | null; region: string | null; color: string | null; requiresAccess: string[] }
interface Equipment {
  id: number; typeId: number; type: EqType; internalNo: string | null; serialNo: string | null
  isRental: boolean; rentalVendor: string | null; rentalStartDate: string | null; rentalEndDate: string | null
  status: string; notes: string | null
  brand?: string | null; model?: string | null; vendor?: string | null
  purchaseDate?: string | null; purchasePrice?: number | null; lifespanYears?: number | null; calDueDate?: string | null
}

const STATUS_OPTS = ['ACTIVE', 'CALIBRATING', 'BROKEN', 'RETIRED'] as const

const TEAM_COLOR: Record<string, string> = {
  ST: 'bg-slate-200 text-slate-700', AMB: 'bg-teal-100 text-teal-700',
  WP: 'bg-purple-100 text-purple-700', CEMS: 'bg-orange-100 text-orange-700',
  WT: 'bg-blue-100 text-blue-700', LOG: 'bg-gray-100 text-gray-600',
}

// ── Shared UI ─────────────────────────────────────────────────
function Btn({ children, onClick, variant = 'default', small }: { children: React.ReactNode; onClick?: () => void; variant?: 'default' | 'danger' | 'ghost'; small?: boolean }) {
  const base = `rounded font-medium transition-colors ${small ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'}`
  const cls  = variant === 'danger'  ? `${base} bg-red-50 text-red-600 hover:bg-red-100`
             : variant === 'ghost'   ? `${base} text-slate-500 hover:bg-slate-100`
             : `${base} bg-slate-800 text-white hover:bg-slate-700`
  return <button className={cls} onClick={onClick}>{children}</button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
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
  const [modal, setModal]         = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing]     = useState<Employee | null>(null)
  const [form, setForm]           = useState({ fullName: '', nickname: '', primaryTeamId: '', birthDate: '', startDate: '', eduField: '', eduInstitute: '' })
  const [photo, setPhoto]         = useState<string | null>(null)   // data URL ใหม่ (ถ้าอัปโหลด)
  const [photoTouched, setPhotoTouched] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [search, setSearch]       = useState('')
  const [viewing, setViewing]     = useState<Employee | null>(null) // การ์ดประวัติ

  const load = useCallback(async () => {
    const [eRes, tRes] = await Promise.all([
      fetch('/api/employees?all=true').then(r => r.json()),
      fetch('/api/teams').then(r => r.json()),
    ])
    setEmployees(eRes); setTeams(tRes)
  }, [])
  useEffect(() => { load() }, [load])

  function openAdd() {
    setForm({ fullName: '', nickname: '', primaryTeamId: String(teams[0]?.id ?? ''), birthDate: '', startDate: '', eduField: '', eduInstitute: '' })
    setPhoto(null); setPhotoTouched(false)
    setEditing(null); setModal('add')
  }
  function openEdit(e: Employee) {
    setForm({
      fullName: e.fullName, nickname: e.nickname ?? '', primaryTeamId: String(e.primaryTeamId),
      birthDate: e.birthDate?.slice(0, 10) ?? '', startDate: e.startDate?.slice(0, 10) ?? '',
      eduField: e.eduField ?? '', eduInstitute: e.eduInstitute ?? '',
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

  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }))
  const filtered = employees.filter(e => !search || e.fullName.includes(search) || (e.nickname ?? '').includes(search))

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ..." className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm focus:outline-none" />
        <p className="text-sm text-slate-400">{filtered.length} คน</p>
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
                  </button>
                </td>
                <td className="px-4 py-2 text-slate-500">{e.nickname ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${TEAM_COLOR[e.primaryTeam.code] ?? 'bg-slate-100 text-slate-600'}`}>{e.primaryTeam.code}</span>
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
            <Input label="ชื่อเล่น" value={form.nickname} onChange={f('nickname')} placeholder="ชาย" />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">ทีม<span className="ml-0.5 text-red-500">*</span></label>
              <CustomSelect
                value={form.primaryTeamId}
                onChange={f('primaryTeamId')}
                options={teams.map(t => ({ value: String(t.id), label: `${t.code} — ${t.name}` }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="วันเกิด" value={form.birthDate} onChange={f('birthDate')} type="date" />
              <Input label="วันเริ่มงาน" value={form.startDate} onChange={f('startDate')} type="date" />
            </div>
            <Input label="การศึกษา ป.ตรี — สาขา" value={form.eduField} onChange={f('eduField')} placeholder="วิศวกรรมสิ่งแวดล้อม" />
            <Input label="สถาบัน" value={form.eduInstitute} onChange={f('eduInstitute')} placeholder="ม.ขอนแก่น" />
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setModal(null)}>ยกเลิก</Btn>
              <Btn onClick={save}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Btn>
            </div>
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
  const [modal,     setModal]     = useState<'add-owned' | 'add-rental' | 'edit' | null>(null)
  const [editing,   setEditing]   = useState<Equipment | null>(null)
  const [filterType, setFilterType] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [viewing,   setViewing]   = useState<Equipment | null>(null)

  const initOwned  = { typeId: '', internalNo: '', serialNo: '', status: 'ACTIVE', notes: '', brand: '', model: '', vendor: '', purchaseDate: '', purchasePrice: '', lifespanYears: '' }
  const initRental = { typeId: '', internalNo: '', rentalVendor: '', rentalStartDate: '', rentalEndDate: '', notes: '' }
  const [ownedForm,  setOwnedForm]  = useState(initOwned)
  const [rentalForm, setRentalForm] = useState(initRental)

  const load = useCallback(async () => {
    const [eRes, tRes] = await Promise.all([
      fetch('/api/equipment?all=true').then(r => r.json()),
      fetch('/api/equipment-types').then(r => r.json()),
    ])
    setEquipment(eRes); setEqTypes(tRes)
  }, [])
  useEffect(() => { load() }, [load])

  async function saveOwned() {
    if (!ownedForm.typeId || !ownedForm.internalNo) return
    setSaving(true)
    const body = { ...ownedForm, isRental: false, typeId: parseInt(ownedForm.typeId) }
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
      setModal('edit')
    }
  }

  async function changeStatus(eq: Equipment, status: string) {
    await fetch(`/api/equipment/${eq.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typeId: eq.typeId, internalNo: eq.internalNo, serialNo: eq.serialNo, isRental: eq.isRental, rentalVendor: eq.rentalVendor, rentalStartDate: eq.rentalStartDate, rentalEndDate: eq.rentalEndDate, status, notes: eq.notes }) })
    load()
  }

  async function del(eq: Equipment) {
    if (!confirm(`ลบ "${eq.internalNo ?? eq.serialNo}" ? ประวัติการใช้งานจะถูกลบด้วย`)) return
    await fetch(`/api/equipment/${eq.id}`, { method: 'DELETE' }); load()
  }

  const today = toDateKey(new Date())
  const filtered = equipment.filter(eq => !filterType || String(eq.typeId) === filterType)
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
        <p className="text-sm text-slate-400">{filtered.length} รายการ</p>
        {role === 'MAINTENANCE' && (
          <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] text-sky-600">เปลี่ยนได้เฉพาะสถานะเครื่องมือ</span>
        )}
        {canManage && (
          <div className="ml-auto flex gap-2">
            <Btn onClick={() => { setEditing(null); setOwnedForm({ ...initOwned, typeId: eqTypes[0] ? String(eqTypes[0].id) : '' }); setModal('add-owned') }}>+ เพิ่มเครื่องมือ (ซื้อ)</Btn>
            <Btn onClick={() => { setEditing(null); setRentalForm({ ...initRental, typeId: eqTypes[0] ? String(eqTypes[0].id) : '' }); setModal('add-rental') }}>+ เพิ่มเครื่องมือ (เช่า)</Btn>
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">ประเภท</th>
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
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{eq.type.code}</td>
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
                  <td className="px-4 py-2">
                    <select value={eq.status} onChange={e => changeStatus(eq, e.target.value)}
                      className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none">
                      {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
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
              <CustomSelect
                value={ownedForm.status}
                onChange={of('status')}
                options={STATUS_OPTS.map(s => ({ value: s, label: s }))}
              />
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
  const [saving, setSaving]       = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const initForm = { equipmentId: '', type: 'REPAIR', sentDate: today, expectedDate: '', vendor: '', cost: '', nextDueDate: '', notes: '' }
  const [form, setForm] = useState(initForm)
  const [retForm, setRetForm] = useState({ returnedDate: today, nextDueDate: '', cost: '' })

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
  async function confirmReturn() {
    if (!returning) return
    setSaving(true)
    await fetch(`/api/equipment-events/${returning.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnedDate: retForm.returnedDate, nextDueDate: retForm.nextDueDate || null, cost: retForm.cost || null }),
    })
    setSaving(false); setReturning(null); load()
  }
  async function del(ev: EqEventRow) {
    if (!confirm('ลบใบงานนี้?')) return
    await fetch(`/api/equipment-events/${ev.id}`, { method: 'DELETE' }); load()
  }

  const open = events.filter(e => !e.returnedDate)
  const history = events.filter(e => e.returnedDate)
  const overdue = (e: EqEventRow) => !e.returnedDate && e.expectedDate && e.expectedDate.slice(0, 10) < today
  const canDelete = role === 'ADMIN' || role === 'MANAGER'

  const TypeBadge = ({ t }: { t: string }) => (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t === 'REPAIR' ? 'bg-red-50 text-red-600' : 'bg-purple-50 text-purple-600'}`}>
      {t === 'REPAIR' ? '🔧 ซ่อม' : '📐 Cal'}
    </span>
  )

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">กำลังส่ง {open.length} รายการ</p>
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
            <th className="px-4 py-2 text-left font-medium">ค่าใช้จ่าย</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {history.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-300">ยังไม่มีประวัติ</td></tr>}
            {history.slice(0, 50).map(ev => (
              <tr key={ev.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-700">{ev.equipment.type.code} {ev.equipment.internalNo ?? ev.equipment.serialNo}</td>
                <td className="px-4 py-2"><TypeBadge t={ev.type} /></td>
                <td className="px-4 py-2 text-xs text-slate-500">{ev.sentDate.slice(0, 10)} → {ev.returnedDate?.slice(0, 10)}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{ev.cost != null ? `${ev.cost.toLocaleString('th-TH')} บาท` : '—'}</td>
                <td className="px-4 py-2 text-right">{canDelete && <Btn small variant="danger" onClick={() => del(ev)}>ลบ</Btn>}</td>
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
              <Input label="กำหนด Cal ครั้งถัดไป" value={retForm.nextDueDate} onChange={v => setRetForm(p => ({ ...p, nextDueDate: v }))} type="date" />
            )}
            <Input label="ค่าใช้จ่าย (บาท)" value={retForm.cost} onChange={v => setRetForm(p => ({ ...p, cost: v }))} type="number" placeholder="0" />
            <div className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-700">รับกลับแล้วเครื่องจะกลับสู่สถานะ "พร้อมใช้" อัตโนมัติ</div>
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setReturning(null)}>ยกเลิก</Btn>
              <Btn onClick={confirmReturn}>{saving ? 'กำลังบันทึก...' : 'ยืนยันรับกลับ'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Section: Calibration annual plan ──────────────────────────
const CAL_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function CalPlanSection() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [eqTypes,   setEqTypes]   = useState<EqType[]>([])
  const [year,      setYear]      = useState(new Date().getFullYear())
  const [filterType, setFilterType] = useState('')

  const load = useCallback(async () => {
    const [eRes, tRes] = await Promise.all([
      fetch('/api/equipment?all=true').then(r => r.json()),
      fetch('/api/equipment-types').then(r => r.json()),
    ])
    setEquipment(Array.isArray(eRes) ? eRes : [])
    setEqTypes(Array.isArray(tRes) ? tRes : [])
  }, [])
  useEffect(() => { load() }, [load])

  const todayKey = new Date().toISOString().slice(0, 10)
  // เครื่องที่มีกำหนด Cal และตรงปีที่เลือก
  const withCal = equipment.filter(eq => {
    if (!eq.calDueDate) return false
    if (filterType && String(eq.typeId) !== filterType) return false
    return new Date(eq.calDueDate).getFullYear() === year
  })

  // group by type
  const groups = new Map<number, { type: EqType; items: Equipment[] }>()
  for (const eq of withCal) {
    const t = eqTypes.find(x => x.id === eq.typeId)
    if (!t) continue
    if (!groups.has(eq.typeId)) groups.set(eq.typeId, { type: t, items: [] })
    groups.get(eq.typeId)!.items.push(eq)
  }
  const groupArr = Array.from(groups.values())

  // สรุปจำนวนต่อเดือน
  const monthCount = Array(12).fill(0) as number[]
  withCal.forEach(eq => { monthCount[new Date(eq.calDueDate!).getMonth()]++ })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
          <button onClick={() => setYear(y => y - 1)} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">‹</button>
          <span className="min-w-[70px] text-center text-sm font-medium text-slate-700">ปี {year + 543}</span>
          <button onClick={() => setYear(y => y + 1)} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">›</button>
        </div>
        <CustomSelect value={filterType} onChange={setFilterType} placeholder="ทุกหมวด" className="w-56"
          options={[{ value: '', label: 'ทุกหมวด' }, ...eqTypes.map(t => ({ value: String(t.id), label: `${t.code} — ${t.name}` }))]} />
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500">{withCal.length} เครื่องในปีนี้</span>
      </div>

      {groupArr.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-300">ยังไม่มีเครื่องที่มีกำหนด Calibrate ในปีนี้<br /><span className="text-xs">กำหนด Cal ครั้งถัดไปได้ตอนรับเครื่องกลับในเมนู ซ่อม/Cal</span></p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-medium min-w-[150px]">เครื่องมือ</th>
                {CAL_MONTHS.map((m, i) => (
                  <th key={m} className="border-l border-slate-100 px-1 py-2 text-center font-medium min-w-[40px]">
                    {m}{monthCount[i] > 0 && <div className="text-[9px] font-normal text-violet-500">{monthCount[i]}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupArr.map(({ type, items }) => (
                <>
                  <tr key={`g-${type.id}`}>
                    <td colSpan={13} className="border-t border-slate-200 bg-slate-100 px-3 py-1 font-semibold text-slate-500">{type.code} — {type.name}</td>
                  </tr>
                  {items.map(eq => {
                    const due = new Date(eq.calDueDate!)
                    const dueMonth = due.getMonth()
                    const overdue = eq.calDueDate!.slice(0, 10) < todayKey
                    return (
                      <tr key={eq.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-slate-700">{eq.internalNo ?? eq.serialNo ?? `#${eq.id}`}</td>
                        {CAL_MONTHS.map((_, i) => (
                          <td key={i} className="border-l border-slate-100 px-1 py-1.5 text-center">
                            {i === dueMonth && (
                              <span title={`${overdue ? 'เกินกำหนด ' : ''}${eq.calDueDate!.slice(0,10)}`}
                                className={`inline-block h-2.5 w-2.5 rounded-full ${overdue ? 'bg-red-500' : 'bg-violet-500'}`} />
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-400"><span className="inline-block h-2 w-2 rounded-full bg-violet-500 align-middle" /> กำหนด Cal · <span className="inline-block h-2 w-2 rounded-full bg-red-500 align-middle" /> เกินกำหนด</p>
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
interface UserRow {
  id: number; username: string; role: UserRole; isActive: boolean
  employeeId: number | null; employeeName: string | null; fullName: string | null; team: string | null
}

function UsersSection({ myUid }: { myUid?: number }) {
  const [users, setUsers]   = useState<UserRow[]>([])
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/users')
    if (r.ok) setUsers(await r.json())
  }, [])
  useEffect(() => { load() }, [load])

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

  const filtered = users.filter(u =>
    !search || u.username.includes(search) || (u.employeeName ?? '').includes(search) || (u.fullName ?? '').includes(search))

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา username / ชื่อ..."
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm focus:outline-none" />
        <p className="text-sm text-slate-400">{filtered.length} บัญชี</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Username</th>
              <th className="px-4 py-2 text-left font-medium">ชื่อ</th>
              <th className="px-4 py-2 text-left font-medium">ทีม</th>
              <th className="px-4 py-2 text-left font-medium">สิทธิ์</th>
              <th className="px-4 py-2 text-left font-medium">สถานะ</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} className={`border-t border-slate-100 hover:bg-slate-50 ${!u.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2 font-mono font-medium text-slate-700">
                  {u.username}{u.id === myUid && <span className="ml-1 text-[10px] text-sky-500">(คุณ)</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{u.employeeName ?? '—'}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{u.team ?? '—'}</td>
                <td className="px-4 py-2 w-44">
                  <CustomSelect value={u.role} onChange={(v) => patch(u, { role: v })}
                    options={ROLE_ORDER.map(r => ({ value: r, label: ROLE_LABEL[r] }))} />
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => patch(u, { isActive: !u.isActive })}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${u.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                    {u.isActive ? 'ใช้งาน' : 'ปิด'}
                  </button>
                </td>
                <td className="px-4 py-2 text-right">
                  <Btn small variant="ghost" onClick={() => resetPw(u)}>รีเซ็ตรหัส</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main AdminView ─────────────────────────────────────────────
type AdminTab = 'sites' | 'employees' | 'equipment' | 'maintenance' | 'calplan' | 'holidays' | 'users'

export default function AdminView() {
  const { me, role } = useMe()
  const [tab, setTab] = useState<AdminTab>('sites')

  const allTabs: { key: AdminTab; label: string; roles: UserRole[] }[] = [
    { key: 'sites',     label: '🏭 ไซต์งาน',  roles: ['ADMIN', 'MANAGER'] },
    { key: 'employees', label: '👤 พนักงาน',   roles: ['ADMIN', 'MANAGER'] },
    { key: 'equipment',   label: '🔧 เครื่องมือ', roles: ['ADMIN', 'MANAGER', 'MAINTENANCE'] },
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
        {active === 'maintenance' && <MaintenanceSection role={role} />}
        {active === 'calplan'     && <CalPlanSection />}
        {active === 'holidays'    && <HolidaysSection />}
        {active === 'users'     && <UsersSection myUid={me?.uid} />}
      </div>
    </div>
  )
}

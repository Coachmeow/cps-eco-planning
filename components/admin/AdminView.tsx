'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { SITE_COLOR_OPTIONS } from '@/lib/siteColors'

// ── Types ─────────────────────────────────────────────────────
interface Team     { id: number; code: string; name: string }
interface EqType   { id: number; code: string; name: string; primaryTeamId: number }
interface Employee { id: number; fullName: string; nickname: string | null; primaryTeamId: number; primaryTeam: Team; isActive: boolean }
interface Site     { id: number; code: string; name: string; clientName: string | null; province: string | null; region: string | null; color: string | null; requiresAccess: string[] }
interface Equipment {
  id: number; typeId: number; type: EqType; internalNo: string | null; serialNo: string | null
  isRental: boolean; rentalVendor: string | null; rentalStartDate: string | null; rentalEndDate: string | null
  status: string; notes: string | null
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
  const [form, setForm]           = useState({ fullName: '', nickname: '', primaryTeamId: '' })
  const [saving, setSaving]       = useState(false)
  const [search, setSearch]       = useState('')

  const load = useCallback(async () => {
    const [eRes, tRes] = await Promise.all([
      fetch('/api/employees').then(r => r.json()),
      fetch('/api/teams').then(r => r.json()),
    ])
    setEmployees(eRes); setTeams(tRes)
  }, [])
  useEffect(() => { load() }, [load])

  function openAdd() {
    setForm({ fullName: '', nickname: '', primaryTeamId: String(teams[0]?.id ?? '') })
    setEditing(null); setModal('add')
  }
  function openEdit(e: Employee) {
    setForm({ fullName: e.fullName, nickname: e.nickname ?? '', primaryTeamId: String(e.primaryTeamId) })
    setEditing(e); setModal('edit')
  }

  async function save() {
    if (!form.fullName || !form.primaryTeamId) return
    setSaving(true)
    if (modal === 'add') {
      await fetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    } else if (editing) {
      await fetch(`/api/employees/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, isActive: editing.isActive }) })
    }
    setSaving(false); setModal(null); load()
  }

  async function toggleActive(e: Employee) {
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
                <td className="px-4 py-2 text-slate-700">{e.fullName}</td>
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

// ── Section: Equipment ────────────────────────────────────────
function EquipmentSection() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [eqTypes,   setEqTypes]   = useState<EqType[]>([])
  const [modal,     setModal]     = useState<'add-owned' | 'add-rental' | 'edit' | null>(null)
  const [editing,   setEditing]   = useState<Equipment | null>(null)
  const [filterType, setFilterType] = useState('')
  const [saving,    setSaving]    = useState(false)

  const initOwned  = { typeId: '', internalNo: '', serialNo: '', status: 'ACTIVE', notes: '' }
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
      setOwnedForm({ typeId: String(eq.typeId), internalNo: eq.internalNo ?? '', serialNo: eq.serialNo ?? '', status: eq.status, notes: eq.notes ?? '' })
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

  const today = new Date().toISOString().slice(0, 10)
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
        <div className="ml-auto flex gap-2">
          <Btn onClick={() => { setEditing(null); setOwnedForm({ ...initOwned, typeId: eqTypes[0] ? String(eqTypes[0].id) : '' }); setModal('add-owned') }}>+ เพิ่มเครื่องมือ (ซื้อ)</Btn>
          <Btn onClick={() => { setEditing(null); setRentalForm({ ...initRental, typeId: eqTypes[0] ? String(eqTypes[0].id) : '' }); setModal('add-rental') }}>+ เพิ่มเครื่องมือ (เช่า)</Btn>
        </div>
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
                  <td className="px-4 py-2 font-medium text-slate-700">{eq.internalNo ?? '—'}</td>
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
                      <Btn small onClick={() => openEdit(eq)}>แก้ไข</Btn>
                      <Btn small variant="danger" onClick={() => del(eq)}>ลบ</Btn>
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
    </div>
  )
}

// ── Main AdminView ─────────────────────────────────────────────
type AdminTab = 'sites' | 'employees' | 'equipment'

export default function AdminView() {
  const [tab, setTab] = useState<AdminTab>('sites')

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'sites',     label: '🏭 ไซต์งาน'  },
    { key: 'employees', label: '👤 พนักงาน'   },
    { key: 'equipment', label: '🔧 เครื่องมือ' },
  ]

  return (
    <div className="h-full overflow-auto bg-slate-50 p-6">
      <h1 className="mb-5 text-base font-semibold text-slate-800">⚙ จัดการข้อมูล</h1>

      {/* Tab selector */}
      <div className="mb-5 flex gap-1 rounded-xl bg-slate-200 p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
        {tab === 'sites'     && <SitesSection />}
        {tab === 'employees' && <EmployeesSection />}
        {tab === 'equipment' && <EquipmentSection />}
      </div>
    </div>
  )
}

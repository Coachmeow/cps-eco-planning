'use client'

import { useEffect, useRef, useState } from 'react'
import type { Employee, Site, ServiceTeam, StaffAssignment, AssignmentStatus } from '@/lib/types'
import { siteDotClass } from '@/lib/siteColors'

interface Props {
  employee:     Employee
  date:         string
  assignments:  StaffAssignment[]
  sites:        Site[]
  teams:        ServiceTeam[]
  allEmployees:        Employee[]
  employeeAssignments?: StaffAssignment[]   // ทั้งเดือนของพนักงานคนนี้ (ใช้หาวันลูกของงานหลายวัน)
  initialDays?:        number                // จำนวนวันเริ่มต้น (จากการเลือกช่วงวันในปฏิทิน)
  canEdit?:            boolean
  onSave:              (payloads: Record<string, unknown>[]) => Promise<void>
  onDelete:            (id: number) => Promise<void>
  onMove?:             (p: { assignmentId: number; newStartDate: string; includeIds: number[] }) => Promise<{ moved: number; skipped: string[] }>
  onClose:             () => void
}

const fmtDay = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })

const STATUS_OPTIONS: { value: AssignmentStatus; label: string }[] = [
  { value: 'FIELD',    label: 'ภาคสนาม (Field)' },
  { value: 'OFFICE',   label: 'สำนักงาน (S)' },
  { value: 'LEAVE',    label: 'ลา (B)' },
  { value: 'HOLIDAY',  label: 'วันหยุด (V)' },
  { value: 'CAL',      label: 'ส่ง Calibrate' },
  { value: 'TRAINING', label: 'อบรม' },
]

export default function AssignmentPopup({
  employee, date, assignments, sites, teams, allEmployees,
  employeeAssignments = [],
  initialDays,
  canEdit = true,
  onSave, onDelete, onMove, onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const [status,        setStatus]        = useState<AssignmentStatus>('FIELD')
  const [siteId,        setSiteId]        = useState('')
  const [serviceTypeId, setServiceTypeId] = useState(String(employee.primaryTeamId))
  const [estimatedDays, setEstimatedDays] = useState(String(Math.min(Math.max(initialDays ?? 1, 1), 31)))
  const [notes,         setNotes]         = useState('')
  const [companions,    setCompanions]    = useState<number[]>([])
  const [showOthers,    setShowOthers]    = useState(false)
  const [saving,        setSaving]        = useState(false)
  // ช่องมีงานอยู่แล้ว → ซ่อนฟอร์มเพิ่มรายการใหม่ไว้ก่อน (กดปุ่มถึงจะโชว์) ; ช่องว่าง → โชว์ฟอร์มเลย
  const [showAdd,       setShowAdd]        = useState(assignments.length === 0)

  // เครื่องมือ/รถที่แนบกับงานที่มีอยู่ (ต่อ staffAssignment ตัวแม่) → โชว์ในรายการที่มีอยู่
  interface Attach {
    equipment: { id: number; label: string; type: string | null }[]
    vehicles:  { id: number; plate: string; name: string | null }[]
    siteEquipment: { id: number; label: string; type: string | null }[]   // จองแยกที่ไซต์
    siteVehicles:  { id: number; plate: string; name: string | null }[]
  }
  const [attach, setAttach] = useState<Map<number, Attach>>(new Map())
  useEffect(() => {
    const parentIds = [...new Set(assignments.map(a => a.parentId ?? a.id))]
    if (parentIds.length === 0) { setAttach(new Map()); return }
    Promise.all(parentIds.map(pid =>
      fetch(`/api/staff-assignments/${pid}/attachments`).then(r => r.json())
        .then(d => [pid, d as Attach] as const).catch(() => [pid, { equipment: [], vehicles: [], siteEquipment: [], siteVehicles: [] } as Attach] as const)
    )).then(entries => setAttach(new Map(entries)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  // เครื่องมือที่แนบไปด้วย
  interface EqItem { id: number; internalNo: string | null; serialNo: string | null; typeId: number; status: string; type: { id: number; code: string; name: string } }
  const [equipList,   setEquipList]   = useState<EqItem[]>([])
  const [equipIds,    setEquipIds]    = useState<number[]>([])
  const [equipSearch, setEquipSearch] = useState('')
  const [pickerOpen,  setPickerOpen]  = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [equipExpanded, setEquipExpanded] = useState<Set<number>>(new Set([employee.primaryTeamId]))

  useEffect(() => {
    fetch('/api/equipment').then(r => r.json()).then(d => Array.isArray(d) && setEquipList(d)).catch(() => {})
  }, [])

  // เครื่องที่ถูกจองแล้วในช่วงวันที่เลือก → busyEq[equipmentId] = [{siteCode, siteColor, date}]
  interface BusyRow { equipmentId: number; assignedDate: string; siteCode: string | null; siteColor: string }
  const [busyEq, setBusyEq] = useState<Map<number, BusyRow[]>>(new Map())
  useEffect(() => {
    if (!pickerOpen || !siteId) return
    fetch(`/api/equipment-assignments/busy?start=${date}&days=${estimatedDays}`)
      .then(r => r.json())
      .then((rows: BusyRow[]) => {
        const m = new Map<number, BusyRow[]>()
        for (const r of rows) {
          if (!m.has(r.equipmentId)) m.set(r.equipmentId, [])
          m.get(r.equipmentId)!.push(r)
        }
        setBusyEq(m)
      }).catch(() => {})
  }, [pickerOpen, date, estimatedDays, siteId])

  const busyTitle = (rows: BusyRow[]) => {
    const bySite = new Map<string, string[]>()
    for (const r of rows) {
      const code = r.siteCode ?? '—'
      if (!bySite.has(code)) bySite.set(code, [])
      bySite.get(code)!.push(new Date(r.assignedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }))
    }
    return 'ถูกจองแล้ว: ' + Array.from(bySite.entries()).map(([c, ds]) => `${c} (${ds.join(', ')})`).join(' · ')
  }

  // เครื่องที่ส่งซ่อม/Cal ในช่วงวันที่เลือก → maint[equipmentId] = สถานะ (บล็อกช่วงที่อยู่ศูนย์ / เผื่อเลื่อนถ้าจองหลังกำหนดรับกลับ)
  interface MaintRow { equipmentId: number; state: 'blocked' | 'tentative'; type?: string; sentDate?: string; expectedDate?: string | null; returnedDate?: string | null }
  const [maintEq, setMaintEq] = useState<Map<number, MaintRow>>(new Map())
  useEffect(() => {
    if (!pickerOpen) return
    fetch(`/api/equipment-assignments/maintenance?start=${date}&days=${estimatedDays}`)
      .then(r => r.json())
      .then((rows: MaintRow[]) => setMaintEq(new Map(rows.map(r => [r.equipmentId, r]))))
      .catch(() => {})
  }, [pickerOpen, date, estimatedDays])

  // ถ้าเครื่องที่เลือกไว้กลายเป็น "บล็อก" (เปลี่ยนวัน) → เอาออกจากรายการที่เลือก
  useEffect(() => {
    setEquipIds(prev => prev.filter(id => maintEq.get(id)?.state !== 'blocked'))
  }, [maintEq])

  const fmtShort = (d?: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '—'
  const maintTitle = (m: MaintRow) => {
    const what = m.type === 'CALIBRATION' ? 'ส่ง Cal' : 'ส่งซ่อม'
    if (m.state === 'tentative') return `⏳ ${what} ${fmtShort(m.sentDate)} · คาดรับกลับ ${fmtShort(m.expectedDate)} — จองได้แต่เผื่อเลื่อน`
    return `⛔ ไม่ว่าง: ${what} ${fmtShort(m.sentDate)}${m.expectedDate ? ` – คาดรับ ${fmtShort(m.expectedDate)}` : ' (ไม่มีกำหนดรับกลับ)'}`
  }

  // รถที่แนบไปด้วย
  interface VehItem { id: number; licensePlate: string; name: string | null; vehicleType: string | null }
  const [vehList,    setVehList]    = useState<VehItem[]>([])
  const [vehicleIds, setVehicleIds] = useState<number[]>([])
  const [vehPickerOpen, setVehPickerOpen] = useState(false)
  useEffect(() => {
    fetch('/api/vehicles').then(r => r.json()).then(d => Array.isArray(d) && setVehList(d)).catch(() => {})
  }, [])

  // รถที่ถูกจองแล้วในช่วงวันที่เลือก → busyVeh[vehicleId] = [{siteCode, driver, date}]
  interface BusyVeh { vehicleId: number; assignedDate: string; siteCode: string | null; driver: string | null }
  const [busyVeh, setBusyVeh] = useState<Map<number, BusyVeh[]>>(new Map())
  useEffect(() => {
    if (!vehPickerOpen) return
    fetch(`/api/vehicle-bookings/busy?start=${date}&days=${estimatedDays}`)
      .then(r => r.json())
      .then((rows: BusyVeh[]) => {
        const m = new Map<number, BusyVeh[]>()
        for (const r of rows) {
          if (!m.has(r.vehicleId)) m.set(r.vehicleId, [])
          m.get(r.vehicleId)!.push(r)
        }
        setBusyVeh(m)
      }).catch(() => {})
  }, [vehPickerOpen, date, estimatedDays])

  const busyVehTitle = (rows: BusyVeh[]) => {
    const parts = rows.map(r => {
      const d = new Date(r.assignedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
      return `${r.siteCode ?? r.driver ?? '—'} (${d})`
    })
    return 'จองแล้ว: ' + parts.join(' · ')
  }

  // เลื่อนงาน (reschedule) — เลือกวันเริ่มใหม่ + ติ๊กเพื่อนร่วมกลุ่มที่จะเลื่อนพร้อมกัน
  interface MovePeer { id: number; name: string }
  const [moveFor,     setMoveFor]     = useState<StaffAssignment | null>(null)
  const [moveDate,    setMoveDate]    = useState('')
  const [movePeers,   setMovePeers]   = useState<MovePeer[]>([])
  const [moveInclude, setMoveInclude] = useState<number[]>([])
  const [moving,      setMoving]      = useState(false)

  function openMove(a: StaffAssignment) {
    setMoveFor(a)
    setMoveDate(String(a.assignedDate).slice(0, 10))
    setMovePeers([])
    setMoveInclude([])
    fetch(`/api/staff-assignments/move?assignmentId=${a.id}`)
      .then(r => r.json())
      .then((rows: MovePeer[]) => {
        if (!Array.isArray(rows)) return
        setMovePeers(rows)
        setMoveInclude(rows.map(p => p.id))   // default = เลื่อนทั้งกลุ่ม
      }).catch(() => {})
  }

  async function handleMove() {
    if (!moveFor || !onMove || !moveDate) return
    setMoving(true)
    try {
      const res = await onMove({ assignmentId: moveFor.id, newStartDate: moveDate, includeIds: moveInclude })
      if (res.skipped.length > 0) alert(`ข้ามงานที่ถูกล็อก: ${res.skipped.join(', ')}`)
      onClose()
    } catch (err) {
      alert(`เลื่อนงานไม่สำเร็จ: ${err instanceof Error ? err.message : err}`)
    } finally {
      setMoving(false)
    }
  }

  // click-outside closes popup (ยกเว้นตอนเปิดแผงเลือกเครื่อง/หน้าสรุป/แผงเลื่อนงาน)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (pickerOpen || confirmOpen || vehPickerOpen || moveFor) return
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose, pickerOpen, confirmOpen, vehPickerOpen, moveFor])

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('th-TH', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
  // ป้ายช่วงวันในหัว popup (เมื่อเลือกช่วง > 1 วัน)
  const endLabel = Number(estimatedDays) > 1
    ? new Date(new Date(date + 'T00:00:00').getTime() + (Math.ceil(Number(estimatedDays)) - 1) * 86400000)
        .toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
    : null

  // companion lists
  const sameTeam  = allEmployees.filter(e => e.primaryTeamId === employee.primaryTeamId && e.id !== employee.id)
  const otherTeam = allEmployees.filter(e => e.primaryTeamId !== employee.primaryTeamId)
  const displayed = showOthers ? [...sameTeam, ...otherTeam] : sameTeam
  const allTeamSelected = sameTeam.length > 0 && sameTeam.every(e => companions.includes(e.id))

  function toggleCompanion(id: number) {
    setCompanions(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  function toggleAllTeam() {
    const ids = sameTeam.map(e => e.id)
    if (allTeamSelected) {
      setCompanions(prev => prev.filter(id => !ids.includes(id)))
    } else {
      setCompanions(prev => [...new Set([...prev, ...ids])])
    }
  }

  // กลุ่มทีมย่อยในทีมเดียวกัน → ปุ่มเลือกทั้งทีมย่อย (เรียงตาม sortOrder)
  const subTeamGroups = (() => {
    const m = new Map<number, { name: string; sortOrder: number; ids: number[] }>()
    for (const e of sameTeam) {
      if (!e.subTeam) continue
      if (!m.has(e.subTeam.id)) m.set(e.subTeam.id, { name: e.subTeam.name, sortOrder: e.subTeam.sortOrder, ids: [] })
      m.get(e.subTeam.id)!.ids.push(e.id)
    }
    return Array.from(m.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  })()

  function toggleSubTeam(ids: number[]) {
    const allSel = ids.every(id => companions.includes(id))
    setCompanions(prev => allSel ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])])
  }

  async function handleSave() {
    if (status === 'FIELD' && !siteId) { alert('กรุณาเลือกไซต์งานก่อนบันทึกงานภาคสนาม'); return }
    setSaving(true)
    const base = {
      assignedDate:  date,
      siteId:        siteId        ? parseInt(siteId)        : undefined,
      serviceTypeId: serviceTypeId ? parseInt(serviceTypeId) : undefined,
      estimatedDays: parseFloat(estimatedDays),
      status,
      notes: notes || undefined,
    }
    // เครื่องมือ/รถ แนบเฉพาะงานภาคสนามที่เลือกไซต์แล้ว — ติดไปกับงานของคนหลัก
    const eqAttach  = status === 'FIELD' && siteId ? equipIds : []
    const vehAttach = status === 'FIELD' && siteId ? vehicleIds : []
    const payloads = [
      { ...base, employeeId: employee.id, equipmentIds: eqAttach, vehicleIds: vehAttach },
      ...companions.map(empId => ({ ...base, employeeId: empId })),
    ]
    try {
      await onSave(payloads)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const totalPeople = 1 + companions.length

  // badge เครื่องมือ/รถ ที่แนบกับงาน (parentId) — โชว์ในรายการที่มีอยู่
  // กลุ่ม 1 (ผูกกับงาน) = badge เทาทึบ ; กลุ่ม 2 (จองแยกที่ไซต์) = badge ขอบประ + ป้าย "จองแยก"
  function renderAttach(parentId: number) {
    const a = attach.get(parentId)
    if (!a) return null
    const hasLinked = a.equipment.length > 0 || a.vehicles.length > 0
    const hasSite   = a.siteEquipment.length > 0 || a.siteVehicles.length > 0
    if (!hasLinked && !hasSite) return null
    return (
      <div className="mt-1 space-y-1">
        {hasLinked && (
          <div className="flex flex-wrap gap-1">
            {a.equipment.map(e => (
              <span key={`e${e.id}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">🔧 {e.label}</span>
            ))}
            {a.vehicles.map(v => (
              <span key={`v${v.id}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">🚗 {v.plate}</span>
            ))}
          </div>
        )}
        {hasSite && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[9px] font-medium text-amber-600">⚟ จองแยกที่ไซต์:</span>
            {a.siteEquipment.map(e => (
              <span key={`se${e.id}`} className="rounded-full border border-dashed border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">🔧 {e.label}</span>
            ))}
            {a.siteVehicles.map(v => (
              <span key={`sv${v.id}`} className="rounded-full border border-dashed border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">🚗 {v.plate}</span>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div ref={ref} className="w-96 rounded-lg border border-slate-200 bg-white shadow-xl max-h-[90vh] overflow-y-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">{employee.nickname ?? employee.fullName}</p>
            <p className="text-xs text-slate-400">{dateLabel}{endLabel && <span className="text-sky-500 font-medium"> – {endLabel} · {estimatedDays} วัน</span>}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>

        {/* ── Existing assignments ── */}
        {assignments.length > 0 && (
          <div className="border-b border-slate-100 px-4 py-2 space-y-2">
            <p className="text-xs text-slate-400 mb-1">รายการที่มีอยู่</p>
            {assignments.map((a) => {
              // งานหลายวัน → รวมตัวแม่ + ตัวลูก เรียงตามวัน
              const group = a.parentId == null
                ? [a, ...employeeAssignments.filter((x) => x.parentId === a.id)]
                    .sort((x, y) => x.assignedDate.localeCompare(y.assignedDate))
                : [a]

              // งานวันเดียว
              if (group.length <= 1) {
                return (
                  <div key={a.id} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700">
                        {a.site?.code ?? a.status}
                        {a.isCrossTeam && <span className="ml-1 rounded bg-sky-100 px-1 text-sky-600">{a.serviceType?.code}</span>}
                      </span>
                      {canEdit && !a.isLocked
                        ? <span className="flex items-center gap-2">
                            {a.parentId == null && a.status === 'FIELD' && onMove && (
                              <button onClick={() => openMove(a)} className="text-sky-500 hover:text-sky-700">↔ เลื่อน</button>
                            )}
                            <button onClick={() => onDelete(a.id)} className="text-red-400 hover:text-red-600">ลบ</button>
                          </span>
                        : a.isLocked ? <span className="text-slate-300 text-[10px]">🔒 ล็อก</span> : null}
                    </div>
                    {a.notes && <p className="mt-0.5 text-[11px] text-amber-600">📝 {a.notes}</p>}
                    {renderAttach(a.parentId ?? a.id)}
                  </div>
                )
              }

              // งานหลายวัน → แตกรายวัน
              return (
                <div key={a.id} className="rounded-lg border border-slate-100 p-2">
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>
                      {a.site?.code ?? a.status}
                      {a.isCrossTeam && <span className="ml-1 rounded bg-sky-100 px-1 text-sky-600">{a.serviceType?.code}</span>}
                      <span className="ml-1 font-normal text-slate-400">({group.length} วัน)</span>
                    </span>
                    {canEdit && !a.isLocked && a.status === 'FIELD' && onMove && (
                      <button onClick={() => openMove(a)} className="font-normal text-sky-500 hover:text-sky-700">↔ เลื่อน</button>
                    )}
                  </div>
                  {a.notes && <p className="mb-1 text-[11px] text-amber-600">📝 {a.notes}</p>}
                  <div className="space-y-0.5">
                    {group.map((g) => {
                      const isParent = g.parentId == null
                      return (
                        <div key={g.id} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">{isParent ? '●' : '○'} {fmtDay(g.assignedDate)}</span>
                          {canEdit && !g.isLocked
                            ? <button onClick={() => onDelete(g.id)}
                                className={isParent ? 'font-medium text-red-500 hover:text-red-700' : 'text-red-400 hover:text-red-600'}>
                                {isParent ? 'ลบทั้งงาน' : 'ลบวันนี้'}
                              </button>
                            : g.isLocked ? <span className="text-slate-300 text-[10px]">🔒</span> : null}
                        </div>
                      )
                    })}
                  </div>
                  {renderAttach(a.id)}
                </div>
              )
            })}
          </div>
        )}

        {/* read-only note for viewers */}
        {!canEdit && (
          <div className="px-4 py-3 text-xs text-slate-400">👁 โหมดดูอย่างเดียว — ไม่มีสิทธิ์แก้ไขแผนงาน</div>
        )}

        {/* ปุ่ม Expand: มีงานอยู่แล้วแต่ยังไม่กางฟอร์ม → กดเพื่อเพิ่มรายการใหม่ (จองซ้อนวัน) */}
        {canEdit && !showAdd && (
          <div className="px-4 py-3">
            <button onClick={() => setShowAdd(true)}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 hover:border-sky-400 hover:text-sky-600 transition-colors">
              + เพิ่มรายการใหม่ (จองซ้อนวัน) ▾
            </button>
          </div>
        )}

        {/* ── Form (เฉพาะผู้มีสิทธิ์จัดแผน + กางฟอร์มแล้ว) ── */}
        {canEdit && showAdd && (
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs font-medium text-slate-500">เพิ่มรายการใหม่</p>

          {/* Status */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">สถานะ</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as AssignmentStatus)}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {status === 'FIELD' && (
            <>
              {/* Site */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">ไซต์งาน</label>
                <select value={siteId} onChange={(e) => setSiteId(e.target.value)}
                  className={`w-full rounded border px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 ${siteId ? 'border-slate-200 focus:ring-slate-300' : 'border-red-300 focus:ring-red-300'}`}>
                  <option value="">— เลือกไซต์ —</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
                {!siteId && <p className="mt-1 text-xs text-red-500">ต้องเลือกไซต์สำหรับงานภาคสนาม</p>}
              </div>

              {/* Service type */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">ประเภทงาน</label>
                <select value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}{t.id === employee.primaryTeamId ? ' (ทีมหลัก)' : ''}
                    </option>
                  ))}
                </select>
                {serviceTypeId && parseInt(serviceTypeId) !== employee.primaryTeamId && (
                  <p className="mt-1 text-xs text-sky-500">Cross-team assignment</p>
                )}
              </div>

              {/* Days */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">จำนวนวัน</label>
                <select value={estimatedDays} onChange={(e) => setEstimatedDays(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
                  {['0.5', ...Array.from({ length: 31 }, (_, i) => String(i + 1))].map((v) => (
                    <option key={v} value={v}>{v} วัน</option>
                  ))}
                </select>
              </div>

              {/* เครื่องมือที่เอาไปด้วย (ไม่บังคับ) → เปิดแผงด้านข้าง */}
              <div>
                <button type="button" disabled={!siteId} onClick={() => setPickerOpen(true)}
                  className="flex w-full items-center justify-between rounded border border-slate-200 px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  <span>🔧 เครื่องมือที่เอาไปด้วย {equipIds.length > 0 && <span className="ml-1 rounded-full bg-slate-700 px-1.5 text-[10px] font-semibold text-white">{equipIds.length}</span>}</span>
                  <span className="text-xs text-slate-400">{siteId ? 'เลือก ›' : 'เลือกไซต์ก่อน'}</span>
                </button>
                {equipIds.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {equipIds.map(id => {
                      const eq = equipList.find(e => e.id === id)
                      return (
                        <span key={id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          {eq ? (eq.internalNo ?? eq.serialNo ?? `#${id}`) : `#${id}`}
                          <button type="button" onClick={() => setEquipIds(prev => prev.filter(i => i !== id))} className="text-slate-400 hover:text-red-500">×</button>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* รถที่ใช้ (ไม่บังคับ) → เปิดแผงด้านข้าง */}
              <div>
                <button type="button" disabled={!siteId} onClick={() => setVehPickerOpen(true)}
                  className="flex w-full items-center justify-between rounded border border-slate-200 px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  <span>🚗 รถที่ใช้ {vehicleIds.length > 0 && <span className="ml-1 rounded-full bg-slate-700 px-1.5 text-[10px] font-semibold text-white">{vehicleIds.length}</span>}</span>
                  <span className="text-xs text-slate-400">{siteId ? 'เลือก ›' : 'เลือกไซต์ก่อน'}</span>
                </button>
                {vehicleIds.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {vehicleIds.map(id => {
                      const v = vehList.find(x => x.id === id)
                      return (
                        <span key={id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          🚗 {v ? v.licensePlate : `#${id}`}
                          <button type="button" onClick={() => setVehicleIds(prev => prev.filter(i => i !== id))} className="text-slate-400 hover:text-red-500">×</button>
                        </span>
                      )
                    })}
                  </div>
                )}
                <p className="mt-1 text-[10px] text-slate-400">คนขับเริ่มต้น = {employee.nickname ?? employee.fullName} (แก้ได้ในแผนใช้รถ)</p>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">หมายเหตุ</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น ห้ามเปลี่ยน, Audit"
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300" />
          </div>
        </div>
        )}

        {/* ── Companion section ── */}
        {canEdit && showAdd && displayed.length > 0 && (
          <div className="border-t border-slate-100 px-4 pb-3 pt-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">👥 คนร่วมงาน</p>
              <div className="flex items-center gap-2">
                {companions.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {companions.length} คนที่เลือก
                  </span>
                )}
                {sameTeam.length > 0 && (
                  <button onClick={toggleAllTeam}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      allTeamSelected
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {allTeamSelected ? '✓ ทั้งทีม' : `เลือกทั้งทีม ${employee.primaryTeam.code}`}
                  </button>
                )}
              </div>
            </div>

            {/* ปุ่มเลือกทั้งทีมย่อย (เฉพาะทีมที่มีทีมย่อย) */}
            {subTeamGroups.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-slate-400">ทีมย่อย:</span>
                {subTeamGroups.map(g => {
                  const allSel = g.ids.every(id => companions.includes(id))
                  return (
                    <button key={g.name} onClick={() => toggleSubTeam(g.ids)}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        allSel ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}>
                      {allSel && <span className="mr-0.5">✓</span>}{g.name}
                      <span className={`ml-0.5 ${allSel ? 'text-white/60' : 'text-slate-400'}`}>({g.ids.length})</span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {displayed.map(emp => {
                const sel = companions.includes(emp.id)
                const isOtherTeam = emp.primaryTeamId !== employee.primaryTeamId
                return (
                  <button
                    key={emp.id}
                    onClick={() => toggleCompanion(emp.id)}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                      sel
                        ? 'border-slate-600 bg-slate-700 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    {sel && <span className="text-[10px] leading-none">✓</span>}
                    <span>{emp.nickname ?? emp.fullName.split(' ')[0]}</span>
                    {isOtherTeam && (
                      <span className={`rounded px-1 text-[9px] ${sel ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        {emp.primaryTeam.code}
                      </span>
                    )}
                  </button>
                )
              })}

              {/* Toggle show other teams */}
              {otherTeam.length > 0 && (
                <button
                  onClick={() => setShowOthers(o => !o)}
                  className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[10px] text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
                >
                  {showOthers ? '▴ ซ่อนทีมอื่น' : `▾ +ทีมอื่น (${otherTeam.length} คน)`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Save button → เปิดหน้าสรุป ── */}
        {canEdit && showAdd && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <button
            onClick={() => { if (status === 'FIELD' && !siteId) { alert('กรุณาเลือกไซต์งานก่อนบันทึกงานภาคสนาม'); return } setConfirmOpen(true) }}
            disabled={saving || (status === 'FIELD' && !siteId)}
            className="w-full rounded bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            ตรวจสอบและบันทึก{totalPeople > 1 ? ` (${totalPeople} คน)` : ''} ›
          </button>
        </div>
        )}
      </div>

      {/* ── แผงเลือกเครื่องมือด้านข้าง ── */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end" onMouseDown={() => setPickerOpen(false)}>
          <div className="h-full w-[380px] max-w-[90vw] overflow-y-auto bg-white shadow-2xl" onMouseDown={e => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">🔧 เลือกเครื่องมือ</p>
                <p className="text-xs text-slate-400">ไป {sites.find(s => String(s.id) === siteId)?.code ?? ''} · {estimatedDays} วัน</p>
              </div>
              <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-semibold text-white">{equipIds.length}</span>
            </div>
            <div className="p-4">
              <input value={equipSearch} onChange={e => setEquipSearch(e.target.value)} placeholder="🔍 ค้นหาเครื่องมือ / หมวด..."
                className="mb-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm placeholder-slate-400 focus:bg-white focus:outline-none" />
              <p className="mb-2 text-[11px] text-slate-400"><span className="inline-block h-2 w-2 rounded-full bg-amber-400 align-middle" /> ถูกจองแล้ว · <span className="text-slate-300 line-through">🔒 ส่งซ่อม/Cal</span> · <span className="text-orange-600">⏳ คาดรับกลับ (เผื่อเลื่อน)</span> — ชี้เมาส์ดูรายละเอียด</p>
              <div className="space-y-2">
                {(() => {
                  const q = equipSearch.trim().toLowerCase()
                  const groups = new Map<number, { code: string; name: string; items: EqItem[] }>()
                  for (const eq of equipList) {
                    if (eq.status === 'RETIRED') continue   // ปลดระวาง → จองไม่ได้ (ส่งซ่อม/Cal เช็คตามช่วงวันจริงด้านล่าง)
                    if (q && !(`${eq.internalNo ?? ''} ${eq.serialNo ?? ''} ${eq.type.code} ${eq.type.name}`.toLowerCase().includes(q))) continue
                    if (!groups.has(eq.typeId)) groups.set(eq.typeId, { code: eq.type.code, name: eq.type.name, items: [] })
                    groups.get(eq.typeId)!.items.push(eq)
                  }
                  const arr = Array.from(groups.entries()).sort((a, b) =>
                    a[0] === employee.primaryTeamId ? -1 : b[0] === employee.primaryTeamId ? 1 : 0)
                  if (arr.length === 0) return <p className="py-6 text-center text-xs text-slate-300">ไม่พบเครื่องมือ</p>
                  return arr.map(([typeId, g]) => {
                    const expanded = equipExpanded.has(typeId) || !!q
                    const ids = g.items.map(e => e.id)
                    const selectableIds = g.items.filter(e => maintEq.get(e.id)?.state !== 'blocked').map(e => e.id)
                    const selCount = ids.filter(id => equipIds.includes(id)).length
                    const allSel = selectableIds.length > 0 && selectableIds.every(id => equipIds.includes(id))
                    return (
                      <div key={typeId} className="overflow-hidden rounded-lg border border-slate-200">
                        <button type="button" onClick={() => setEquipExpanded(prev => { const n = new Set(prev); n.has(typeId) ? n.delete(typeId) : n.add(typeId); return n })}
                          className="flex w-full items-center justify-between bg-slate-50 px-3 py-2 text-left hover:bg-slate-100">
                          <span className="text-sm font-semibold text-slate-700">{g.code} <span className="text-xs font-normal text-slate-400">{g.name}</span></span>
                          <span className="flex items-center gap-2">
                            {selCount > 0 && <span className="rounded-full bg-slate-700 px-1.5 text-[10px] font-bold text-white">{selCount}</span>}
                            <span className="text-[10px] text-slate-400">{expanded ? '▴' : `▾ ${g.items.length}`}</span>
                          </span>
                        </button>
                        {expanded && (
                          <div className="px-3 py-2">
                            <button type="button" onClick={() => setEquipIds(prev => allSel ? prev.filter(id => !selectableIds.includes(id)) : [...new Set([...prev, ...selectableIds])])}
                              className="mb-2 text-[11px] font-medium text-sky-600 hover:underline">{allSel ? 'เอาออกทั้งหมด' : 'เลือกทั้งหมด'}</button>
                            <div className="grid grid-cols-2 gap-1.5">
                              {g.items.map(eq => {
                                const sel = equipIds.includes(eq.id)
                                const busy = busyEq.get(eq.id)
                                const maint = maintEq.get(eq.id)
                                const blocked = maint?.state === 'blocked'
                                const tentative = maint?.state === 'tentative'
                                return (
                                  <button key={eq.id} type="button"
                                    disabled={blocked}
                                    title={maint ? maintTitle(maint) : busy ? busyTitle(busy) : undefined}
                                    onClick={() => { if (blocked) return; setEquipIds(prev => sel ? prev.filter(i => i !== eq.id) : [...prev, eq.id]) }}
                                    className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                                      blocked ? 'border-slate-200 bg-slate-100 text-slate-300 line-through cursor-not-allowed'
                                      : sel ? 'border-slate-600 bg-slate-700 text-white'
                                      : tentative ? 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100'
                                      : busy ? 'border-amber-300 bg-amber-50 text-slate-600 hover:bg-amber-100'
                                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
                                    {blocked && <span className="text-[10px]">🔒</span>}
                                    {tentative && !sel && <span className="text-[10px]">⏳</span>}
                                    {sel && <span className="text-[10px]">✓</span>}
                                    {busy && !sel && !blocked && !tentative && <span className={`h-2 w-2 shrink-0 rounded-full ${siteDotClass(busy[0].siteColor)}`} />}
                                    <span className="truncate">{eq.internalNo ?? eq.serialNo ?? `#${eq.id}`}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
            <div className="sticky bottom-0 flex gap-2 border-t border-slate-100 bg-white px-4 py-3">
              <button type="button" onClick={() => setEquipIds([])} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">ล้าง</button>
              <button type="button" onClick={() => setPickerOpen(false)} className="flex-1 rounded-lg bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800">เสร็จ ({equipIds.length})</button>
            </div>
          </div>
        </div>
      )}

      {/* ── แผงเลือกรถด้านข้าง ── */}
      {vehPickerOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end" onMouseDown={() => setVehPickerOpen(false)}>
          <div className="h-full w-[340px] max-w-[90vw] overflow-y-auto bg-white shadow-2xl" onMouseDown={e => e.stopPropagation()}>
            <div className="sticky top-0 border-b border-slate-100 bg-white px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">🚗 เลือกรถ</p>
                <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-semibold text-white">{vehicleIds.length}</span>
              </div>
              {vehList.length > 0 && (() => {
                const busyCount = vehList.filter(v => busyVeh.has(v.id)).length
                return (
                  <p className="mt-1 text-[11px] text-slate-400">
                    <span className="text-emerald-600">ว่าง {vehList.length - busyCount}</span>
                    {busyCount > 0 && <span className="text-amber-600"> · ไม่ว่าง {busyCount}</span>}
                    <span> ({dateLabel}{Number(estimatedDays) > 1 ? ` · ${estimatedDays} วัน` : ''})</span>
                  </p>
                )
              })()}
            </div>
            <div className="space-y-1.5 p-4">
              {vehList.length === 0 && <p className="py-6 text-center text-xs text-slate-300">ยังไม่มีรถในระบบ</p>}
              {[...vehList].sort((a, b) => (busyVeh.has(a.id) ? 1 : 0) - (busyVeh.has(b.id) ? 1 : 0)).map(v => {
                const sel  = vehicleIds.includes(v.id)
                const busy = busyVeh.get(v.id)
                return (
                  <button key={v.id} type="button" title={busy ? busyVehTitle(busy) : undefined}
                    onClick={() => setVehicleIds(prev => sel ? prev.filter(i => i !== v.id) : [...prev, v.id])}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                      sel ? (busy ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-600 bg-slate-700 text-white')
                          : busy ? 'border-amber-200 bg-amber-50 text-slate-500 hover:border-amber-300'
                                 : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}>
                    {sel && <span className="text-[10px]">✓</span>}
                    <span className="font-medium">🚗 {v.licensePlate}</span>
                    <span className={`truncate text-xs ${sel ? 'text-white/70' : 'text-slate-400'}`}>{[v.name, v.vehicleType].filter(Boolean).join(' · ')}</span>
                    {busy && (
                      <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${sel ? 'bg-white/25 text-white' : 'bg-amber-200 text-amber-800'}`}>
                        ⚠ จองแล้ว{busy[0].siteCode ? ` · ${busy[0].siteCode}` : busy[0].driver ? ` · ${busy[0].driver}` : ''}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="sticky bottom-0 flex gap-2 border-t border-slate-100 bg-white px-4 py-3">
              <button type="button" onClick={() => setVehicleIds([])} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">ล้าง</button>
              <button type="button" onClick={() => setVehPickerOpen(false)} className="flex-1 rounded-lg bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800">เสร็จ ({vehicleIds.length})</button>
            </div>
          </div>
        </div>
      )}

      {/* ── หน้าสรุปก่อนยืนยัน ── */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onMouseDown={() => !saving && setConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl" onMouseDown={e => e.stopPropagation()}>
            <div className="border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-semibold text-slate-800">ตรวจสอบก่อนบันทึก</p>
            </div>
            <div className="space-y-2 px-5 py-4 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">สถานะ</span><span className="text-slate-700">{STATUS_OPTIONS.find(o => o.value === status)?.label}</span></div>
              {status === 'FIELD' && <>
                <div className="flex justify-between"><span className="text-slate-400">ไซต์งาน</span><span className="font-medium text-slate-700">{sites.find(s => String(s.id) === siteId)?.code ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">ประเภทงาน</span><span className="text-slate-700">{teams.find(t => String(t.id) === serviceTypeId)?.code ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">วันที่เริ่ม / จำนวน</span><span className="text-slate-700">{dateLabel} · {estimatedDays} วัน</span></div>
              </>}
              <div className="border-t border-slate-50 pt-2">
                <p className="mb-1 text-xs text-slate-400">คน ({totalPeople})</p>
                <div className="flex flex-wrap gap-1">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{employee.nickname ?? employee.fullName}</span>
                  {companions.map(id => { const e = allEmployees.find(x => x.id === id); return <span key={id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{e?.nickname ?? e?.fullName ?? `#${id}`}</span> })}
                </div>
              </div>
              {status === 'FIELD' && equipIds.length > 0 && (
                <div className="border-t border-slate-50 pt-2">
                  <p className="mb-1 text-xs text-slate-400">เครื่องมือ ({equipIds.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {equipIds.map(id => { const eq = equipList.find(e => e.id === id); return <span key={id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{eq ? (eq.internalNo ?? eq.serialNo ?? `#${id}`) : `#${id}`}</span> })}
                  </div>
                </div>
              )}
              {status === 'FIELD' && vehicleIds.length > 0 && (
                <div className="border-t border-slate-50 pt-2">
                  <p className="mb-1 text-xs text-slate-400">รถ ({vehicleIds.length}) · คนขับ {employee.nickname ?? employee.fullName}</p>
                  <div className="flex flex-wrap gap-1">
                    {vehicleIds.map(id => { const v = vehList.find(x => x.id === id); return <span key={id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">🚗 {v ? v.licensePlate : `#${id}`}</span> })}
                  </div>
                </div>
              )}
              {notes && <div className="border-t border-slate-50 pt-2 text-xs"><span className="text-slate-400">หมายเหตุ: </span><span className="text-slate-600">{notes}</span></div>}
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-5 py-3">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={saving} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-50">แก้ไข</button>
              <button type="button" onClick={handleSave} disabled={saving} className="flex-1 rounded-lg bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">{saving ? 'กำลังบันทึก...' : 'ยืนยันบันทึก'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── แผงเลื่อนงาน (จำนวนวันเท่าเดิม + เลื่อนทั้งกลุ่มได้) ── */}
      {moveFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onMouseDown={() => !moving && setMoveFor(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl" onMouseDown={e => e.stopPropagation()}>
            <div className="border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-semibold text-slate-800">↔ เลื่อนงาน {moveFor.site?.code ?? ''}</p>
              <p className="text-xs text-slate-400">
                เดิมเริ่ม {fmtDay(moveFor.assignedDate)} · {Number(moveFor.estimatedDays)} วัน — จำนวนวันคงเดิม
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div>
                <label className="mb-1 block text-xs text-slate-500">วันเริ่มใหม่</label>
                <input type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300" />
              </div>
              {movePeers.length > 0 && (
                <div>
                  <p className="mb-1 text-xs text-slate-500">เลื่อนพร้อมกัน (กลุ่มเดียวกัน {movePeers.length} คน)</p>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-slate-100 p-2">
                    {movePeers.map(p => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                        <input type="checkbox" checked={moveInclude.includes(p.id)}
                          onChange={() => setMoveInclude(prev => prev.includes(p.id) ? prev.filter(i => i !== p.id) : [...prev, p.id])} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">ติ๊กออก = คนนั้นไม่ถูกเลื่อน (งานเดิมคงอยู่)</p>
                </div>
              )}
              <p className="rounded bg-sky-50 px-2 py-1.5 text-xs text-sky-700">
                จะเลื่อน {1 + moveInclude.length} คน · {Number(moveFor.estimatedDays)} วัน → เริ่ม {moveDate ? fmtDay(moveDate) : '—'}
                <span className="block text-[10px] text-sky-500">เครื่องมือ/รถที่ผูกกับงานถูกเลื่อนตามด้วย</span>
              </p>
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-5 py-3">
              <button type="button" onClick={() => setMoveFor(null)} disabled={moving}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-50">ยกเลิก</button>
              <button type="button" onClick={handleMove}
                disabled={moving || !moveDate || moveDate === String(moveFor.assignedDate).slice(0, 10)}
                className="flex-1 rounded-lg bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {moving ? 'กำลังเลื่อน...' : 'ยืนยันเลื่อน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

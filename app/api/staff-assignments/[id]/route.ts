import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'
import { overlappingEventWhere, maintStateForWindow, type MaintEvent } from '@/lib/equipmentAvailability'

const DAY_MS = 86400000

// เลื่อนวัน (@db.Date เก็บเฉพาะวันที่ → คำนวณด้วย UTC กันเพี้ยนข้ามโซนเวลา)
function shiftUTC(base: Date, days: number): Date {
  const d = new Date(base)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days))
}
// จำนวนวันลูกของงานคน (สอดคล้อง create: for i=1; i<estimatedDays) — 3วัน=2ลูก, 2.5=2ลูก, ≤1=0
function childCountFor(days: number): number { return Math.max(0, Math.ceil(days) - 1) }
// จำนวนวันของเครื่องมือ/รถ (สอดคล้อง create route.ts:93)
function gearDaysFor(days: number): number { return Math.min(Math.floor(days) || 1, 20) }

// คัดเฉพาะเครื่องมือที่ "ว่าง" ในช่วงวันจอง (เช็คเฉพาะตัวที่เพิ่งเพิ่ม — ไม่แตะตัวที่แนบอยู่แล้ว)
async function filterAvailableEquipment(tx: Prisma.TransactionClient, ids: number[], start: Date, days: number): Promise<number[]> {
  if (!ids.length) return []
  const bEnd = shiftUTC(start, days - 1)
  const [eqRows, evRows] = await Promise.all([
    tx.equipment.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } }),
    tx.equipmentEvent.findMany({
      where: { equipmentId: { in: ids }, ...overlappingEventWhere(start, bEnd) },
      select: { equipmentId: true, sentDate: true, expectedDate: true, returnedDate: true },
    }),
  ])
  const evByEq = new Map<number, MaintEvent[]>()
  for (const e of evRows) {
    if (!evByEq.has(e.equipmentId)) evByEq.set(e.equipmentId, [])
    evByEq.get(e.equipmentId)!.push({ sentDate: e.sentDate, expectedDate: e.expectedDate, returnedDate: e.returnedDate })
  }
  const ok = new Set(
    eqRows
      .filter(e => e.status !== 'RETIRED' && maintStateForWindow(evByEq.get(e.id) ?? [], start, bEnd).state !== 'blocked')
      .map(e => e.id)
  )
  return ids.filter(id => ok.has(id))
}

interface JobVals {
  siteId: number | null
  serviceTypeId: number | null
  isCrossTeam: boolean
  estimatedDays: number
  status: string
  leaveType: string | null
  notes: string | null
  isTentative: boolean
  tentativeReason: string | null
}

// อัปเดตฟิลด์ระดับงานของการ์ดแม่ 1 ใบ + จัดวันลูกให้ตรง
//  rebuildChildren=true (จำนวนวันเปลี่ยน) → ลบวันลูกเดิมสร้างใหม่ต่อเนื่อง (โครงวันเปลี่ยนตามจำนวนวันใหม่)
//  rebuildChildren=false (วันเท่าเดิม) → อัปเดตฟิลด์วันลูกเดิม คงวันที่/ช่องว่างไว้ (งานที่เคยเล็มวันกลางออก)
async function applyJobFields(tx: Prisma.TransactionClient, parent: { id: number; employeeId: number; assignedDate: Date }, v: JobVals, rebuildChildren: boolean) {
  await tx.staffAssignment.update({
    where: { id: parent.id },
    data: {
      siteId: v.siteId, serviceTypeId: v.serviceTypeId, isCrossTeam: v.isCrossTeam,
      estimatedDays: v.estimatedDays, status: v.status as never, leaveType: v.leaveType, notes: v.notes,
      isTentative: v.isTentative, tentativeReason: v.tentativeReason,
    },
  })
  const childData = {
    siteId: v.siteId, serviceTypeId: v.serviceTypeId, isCrossTeam: v.isCrossTeam,
    status: v.status as never, leaveType: v.leaveType, notes: v.notes,
    isTentative: v.isTentative, tentativeReason: v.tentativeReason,
  }
  if (rebuildChildren) {
    await tx.staffAssignment.deleteMany({ where: { parentId: parent.id } })
    const n = childCountFor(v.estimatedDays)
    for (let i = 1; i <= n; i++) {
      await tx.staffAssignment.create({
        data: { employeeId: parent.employeeId, assignedDate: shiftUTC(parent.assignedDate, i), estimatedDays: 0, parentId: parent.id, ...childData },
      })
    }
  } else {
    await tx.staffAssignment.updateMany({ where: { parentId: parent.id }, data: childData })
  }
}

// ลบเครื่องมือ/รถที่ผูกกับการ์ด (แม่+วันลูก) ทั้งหมด — สำหรับ dropAllGear หรือก่อน rebuild
async function deleteLinkedGear(tx: Prisma.TransactionClient, staffAssignmentId: number) {
  const eqIds = (await tx.equipmentAssignment.findMany({ where: { staffAssignmentId }, select: { id: true } })).map(e => e.id)
  if (eqIds.length) {
    await tx.equipmentAssignment.deleteMany({ where: { parentId: { in: eqIds } } })
    await tx.equipmentAssignment.deleteMany({ where: { id: { in: eqIds } } })
  }
  const vbIds = (await tx.vehicleBooking.findMany({ where: { staffAssignmentId }, select: { id: true } })).map(v => v.id)
  if (vbIds.length) {
    await tx.vehicleBooking.deleteMany({ where: { parentId: { in: vbIds } } })
    await tx.vehicleBooking.deleteMany({ where: { id: { in: vbIds } } })
  }
}

// สร้างเครื่องมือ 1 ตัว (แม่+วันลูก) ผูกกับงานคน
async function createEquipmentChain(tx: Prisma.TransactionClient, equipmentId: number, staffAssignmentId: number, start: Date, siteId: number, gearDays: number, tentative: { isTentative: boolean; tentativeReason: string | null }) {
  const p = await tx.equipmentAssignment.create({
    data: { equipmentId, assignedDate: start, siteId, staffAssignmentId, estimatedDays: gearDays, ...tentative },
  })
  for (let i = 1; i < gearDays; i++) {
    await tx.equipmentAssignment.create({
      data: { equipmentId, assignedDate: shiftUTC(start, i), siteId, staffAssignmentId, estimatedDays: 0, parentId: p.id, ...tentative },
    })
  }
}
// สร้างรถ 1 คัน (แม่+วันลูก) ผูกกับงานคน — คนขับ = เจ้าของงาน
async function createVehicleChain(tx: Prisma.TransactionClient, vehicleId: number, staffAssignmentId: number, driverId: number, start: Date, siteId: number, gearDays: number, tentative: { isTentative: boolean; tentativeReason: string | null }) {
  const p = await tx.vehicleBooking.create({
    data: { vehicleId, assignedDate: start, purpose: 'FIELD', siteId, staffAssignmentId, driverId, estimatedDays: gearDays, ...tentative },
  })
  for (let i = 1; i < gearDays; i++) {
    await tx.vehicleBooking.create({
      data: { vehicleId, assignedDate: shiftUTC(start, i), purpose: 'FIELD', siteId, staffAssignmentId, driverId, estimatedDays: 0, parentId: p.id, ...tentative },
    })
  }
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = parseInt(String(v)); return Number.isFinite(n) ? n : null
}
const numArr = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.map(x => parseInt(String(x))).filter(Number.isFinite))] : []

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { id } = await params
  const targetId = parseInt(id)

  const target = await prisma.staffAssignment.findUnique({ where: { id: targetId } })
  if (!target) return NextResponse.json({ error: 'ไม่พบรายการ' }, { status: 404 })

  if (target.parentId == null) {
    // วันแม่ → ลบทั้งงาน (ลูกหายตาม)
    // เครื่อง/รถ ที่จอง "พ่วงมากับงานนี้" (staffAssignmentId ชี้มาที่งานแม่หรือวันลูก) → ลบตามทั้งชุด
    // ส่วนที่จองแยกเอง (staffAssignmentId = null) ไม่ถูกแตะ
    await prisma.$transaction(async (tx) => {
      await deleteLinkedGear(tx, targetId)
      await tx.staffAssignment.deleteMany({ where: { parentId: targetId } })
      await tx.staffAssignment.delete({ where: { id: targetId } })
    })
  } else {
    // วันลูก → ลบเฉพาะวันนั้น + วันลูกของเครื่องมือ/รถวันเดียวกัน แล้วลดจำนวนวันที่ตัวแม่ให้ตรง
    await prisma.$transaction(async (tx) => {
      await tx.staffAssignment.delete({ where: { id: targetId } })
      // เครื่องมือ/รถของวันที่ลบ (ผูกกับงานแม่ วันเดียวกัน เป็นวันลูก) → เอาออกด้วย กัน booking ค้าง
      await tx.equipmentAssignment.deleteMany({ where: { staffAssignmentId: target.parentId!, assignedDate: target.assignedDate, parentId: { not: null } } })
      await tx.vehicleBooking.deleteMany({ where: { staffAssignmentId: target.parentId!, assignedDate: target.assignedDate, parentId: { not: null } } })
      const remaining = await tx.staffAssignment.count({ where: { parentId: target.parentId } })
      await tx.staffAssignment.update({ where: { id: target.parentId! }, data: { estimatedDays: 1 + remaining } })
    })
  }
  return NextResponse.json({ success: true })
}

// PATCH — แก้ไขงานเต็มรูปแบบ (ไซต์/ประเภทงาน/จำนวนวัน/สถานะ/หมายเหตุ/tentative + เครื่องมือ/รถ) ใน transaction เดียว
//  รองรับ applyToIds = ใช้กับคนร่วมงานทั้งกลุ่ม, regearFromId/regearToId = ย้ายเครื่องมือเมื่อเจ้าของไม่ถูกย้าย
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { id } = await params
  const mainId = parseInt(id)
  const body = await req.json()

  const current = await prisma.staffAssignment.findUnique({
    where: { id: mainId },
    include: { employee: { select: { primaryTeamId: true } } },
  })
  if (!current) return NextResponse.json({ error: 'ไม่พบงาน' }, { status: 404 })
  if (current.parentId != null) return NextResponse.json({ error: 'แก้ได้เฉพาะวันแม่ของงาน' }, { status: 400 })
  if (current.isLocked) return NextResponse.json({ error: 'งานนี้ถูกล็อกไว้ แก้ไม่ได้' }, { status: 403 })

  // ── ค่าใหม่ (merge body ทับค่าเดิม) ──
  const newStatus = (body.status ?? current.status) as string
  const newSiteId = ('siteId' in body) ? num(body.siteId) : current.siteId
  const newServiceTypeId = ('serviceTypeId' in body) ? num(body.serviceTypeId) : current.serviceTypeId
  const newDays = (body.estimatedDays != null && body.estimatedDays !== '') ? Number(body.estimatedDays) : Number(current.estimatedDays)
  const newNotes = ('notes' in body) ? (body.notes || null) : current.notes
  const newLeaveType = newStatus === 'LEAVE' ? ((body.leaveType ?? current.leaveType) || null) : null
  const newTentative = ('isTentative' in body) ? !!body.isTentative : current.isTentative
  const newTentReason = newTentative ? ((('tentativeReason' in body) ? body.tentativeReason : current.tentativeReason) || null) : null

  if (newStatus === 'FIELD' && !newSiteId) return NextResponse.json({ error: 'งานภาคสนามต้องเลือกไซต์งาน' }, { status: 400 })
  if (newStatus === 'LEAVE' && !newLeaveType) return NextResponse.json({ error: 'กรุณาเลือกประเภทการลา' }, { status: 400 })
  if (!(newDays > 0)) return NextResponse.json({ error: 'จำนวนวันไม่ถูกต้อง' }, { status: 400 })

  const applyToIds = numArr(body.applyToIds).filter(i => i !== mainId)
  const addEquipmentIds = numArr(body.addEquipmentIds)
  const removeEquipmentIds = new Set(numArr(body.removeEquipmentIds))
  const addVehicleIds = numArr(body.addVehicleIds)
  const removeVehicleIds = new Set(numArr(body.removeVehicleIds))
  const regearFromId = num(body.regearFromId)
  const regearToId = num(body.regearToId)

  const siteChanged = newSiteId !== current.siteId
  const daysChanged = newDays !== Number(current.estimatedDays)
  const changingIds = [mainId, ...applyToIds]

  // ── เช็ค "เครื่องมือค้าง" (A2): ย้ายไซต์/วัน แต่การ์ดเจ้าของเครื่องมือไม่ถูกย้าย ──
  if ((siteChanged || daysChanged) && newStatus === 'FIELD' && !(regearFromId && regearToId)) {
    const peers = await prisma.staffAssignment.findMany({
      where: {
        parentId: null, id: { notIn: changingIds },
        assignedDate: current.assignedDate, siteId: current.siteId,
        estimatedDays: current.estimatedDays, status: current.status, serviceTypeId: current.serviceTypeId,
      },
      select: { id: true, employee: { select: { nickname: true, fullName: true } } },
    })
    for (const p of peers) {
      const [eqRows, vbRows] = await Promise.all([
        prisma.equipmentAssignment.findMany({ where: { staffAssignmentId: p.id, parentId: null }, select: { equipment: { select: { internalNo: true, serialNo: true } } } }),
        prisma.vehicleBooking.findMany({ where: { staffAssignmentId: p.id, parentId: null }, select: { vehicle: { select: { licensePlate: true } } } }),
      ])
      if (eqRows.length + vbRows.length > 0) {
        const targets = await prisma.staffAssignment.findMany({
          where: { id: { in: changingIds } },
          select: { id: true, employee: { select: { nickname: true, fullName: true } } },
        })
        return NextResponse.json({
          error: 'equipment_stranded',
          ownerId: p.id,
          ownerName: p.employee.nickname ?? p.employee.fullName,
          ownerEquipment: eqRows.map(e => e.equipment.internalNo ?? e.equipment.serialNo ?? '—'),
          ownerVehicles: vbRows.map(v => v.vehicle.licensePlate),
          targets: targets.map(t => ({ id: t.id, name: t.employee.nickname ?? t.employee.fullName })),
        }, { status: 409 })
      }
    }
  }

  const gearDays = gearDaysFor(newDays)
  const dropAllGear = newStatus !== 'FIELD' || !newSiteId
  const tentative = { isTentative: newTentative, tentativeReason: newTentReason }
  const skipped: string[] = []

  await prisma.$transaction(async (tx) => {
    // ── 1) การ์ดหลัก (คนที่กดแก้) ──
    const mainCrossTeam = newServiceTypeId != null && newServiceTypeId !== current.employee.primaryTeamId
    const mainVals: JobVals = {
      siteId: newSiteId, serviceTypeId: newServiceTypeId, isCrossTeam: mainCrossTeam,
      estimatedDays: newDays, status: newStatus, leaveType: newLeaveType, notes: newNotes,
      isTentative: newTentative, tentativeReason: newTentReason,
    }
    await applyJobFields(tx, current, mainVals, daysChanged)

    // ── 2) เครื่องมือ/รถ ของการ์ดหลัก ──
    const gearTouched = dropAllGear || siteChanged || daysChanged
      || addEquipmentIds.length > 0 || removeEquipmentIds.size > 0
      || addVehicleIds.length > 0 || removeVehicleIds.size > 0
    if (gearTouched) {
      const curEq = (await tx.equipmentAssignment.findMany({ where: { staffAssignmentId: mainId, parentId: null }, select: { equipmentId: true } })).map(e => e.equipmentId)
      const curVeh = (await tx.vehicleBooking.findMany({ where: { staffAssignmentId: mainId, parentId: null }, select: { vehicleId: true } })).map(v => v.vehicleId)
      await deleteLinkedGear(tx, mainId)
      if (!dropAllGear && newSiteId) {
        const keepEq = curEq.filter(i => !removeEquipmentIds.has(i))
        const addEqNew = addEquipmentIds.filter(i => !keepEq.includes(i))
        const addEqOk = await filterAvailableEquipment(tx, addEqNew, current.assignedDate, gearDays)
        const finalEq = [...new Set([...keepEq, ...addEqOk])]
        for (const eqId of finalEq) await createEquipmentChain(tx, eqId, mainId, current.assignedDate, newSiteId, gearDays, tentative)

        const keepVeh = curVeh.filter(i => !removeVehicleIds.has(i))
        const finalVeh = [...new Set([...keepVeh, ...addVehicleIds])]
        for (const vId of finalVeh) await createVehicleChain(tx, vId, mainId, current.employeeId, current.assignedDate, newSiteId, gearDays, tentative)
      }
    } else if (('isTentative' in body)) {
      // แก้แค่ tentative → ปรับธงเครื่องมือ/รถตามโดยไม่รื้อ
      await tx.equipmentAssignment.updateMany({ where: { staffAssignmentId: mainId }, data: tentative })
      await tx.vehicleBooking.updateMany({ where: { staffAssignmentId: mainId }, data: tentative })
    }

    // ── 3) ย้ายเครื่องมือจากเจ้าของที่ไม่ถูกย้าย → การ์ดที่ย้าย (A2 option 2) ──
    if (regearFromId && regearToId && newSiteId && changingIds.includes(regearToId)) {
      const tgt = await tx.staffAssignment.findUnique({ where: { id: regearToId }, select: { employeeId: true, assignedDate: true } })
      if (tgt) {
        const fromEq = (await tx.equipmentAssignment.findMany({ where: { staffAssignmentId: regearFromId, parentId: null }, select: { equipmentId: true } })).map(e => e.equipmentId)
        const fromVeh = (await tx.vehicleBooking.findMany({ where: { staffAssignmentId: regearFromId, parentId: null }, select: { vehicleId: true } })).map(v => v.vehicleId)
        await deleteLinkedGear(tx, regearFromId)
        for (const eqId of fromEq) await createEquipmentChain(tx, eqId, regearToId, tgt.assignedDate, newSiteId, gearDays, tentative)
        for (const vId of fromVeh) await createVehicleChain(tx, vId, regearToId, tgt.employeeId, tgt.assignedDate, newSiteId, gearDays, tentative)
      }
    }

    // ── 4) ใช้กับคนร่วมงานทั้งกลุ่ม (job-level เท่านั้น ไม่ยุ่งเครื่องมือ/รถของ peer) ──
    if (applyToIds.length > 0) {
      const peers = await tx.staffAssignment.findMany({
        where: { id: { in: applyToIds }, parentId: null },
        include: { employee: { select: { nickname: true, fullName: true, primaryTeamId: true } } },
      })
      for (const peer of peers) {
        if (peer.isLocked) { skipped.push(peer.employee.nickname ?? peer.employee.fullName); continue }
        const peerCross = newServiceTypeId != null && newServiceTypeId !== peer.employee.primaryTeamId
        const peerDaysChanged = newDays !== Number(peer.estimatedDays)
        await applyJobFields(tx, peer, { ...mainVals, isCrossTeam: peerCross }, peerDaysChanged)
        if (dropAllGear) await deleteLinkedGear(tx, peer.id)
        else if (siteChanged || daysChanged) {
          // peer ปกติไม่มีเครื่องมือ แต่เผื่อมี → ย้ายไซต์/ปรับวันให้ตรง (rebuild)
          const pe = (await tx.equipmentAssignment.findMany({ where: { staffAssignmentId: peer.id, parentId: null }, select: { equipmentId: true } })).map(e => e.equipmentId)
          const pv = (await tx.vehicleBooking.findMany({ where: { staffAssignmentId: peer.id, parentId: null }, select: { vehicleId: true } })).map(v => v.vehicleId)
          if (pe.length || pv.length) {
            await deleteLinkedGear(tx, peer.id)
            if (newSiteId) {
              for (const eqId of pe) await createEquipmentChain(tx, eqId, peer.id, peer.assignedDate, newSiteId, gearDays, tentative)
              for (const vId of pv) await createVehicleChain(tx, vId, peer.id, peer.employeeId, peer.assignedDate, newSiteId, gearDays, tentative)
            }
          }
        }
      }
    }
  })

  const updated = await prisma.staffAssignment.findUnique({
    where: { id: mainId },
    include: { employee: true, site: true, serviceType: true },
  })
  return NextResponse.json({ ok: true, updated, appliedPeers: applyToIds.length, skipped })
}

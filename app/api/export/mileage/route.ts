import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'
import { PURPOSE_META } from '@/lib/vehiclePurpose'
import type { VehiclePurpose } from '@/lib/types'

// Export Excel สรุปไมล์รถ (สำหรับทำจ่ายตาม Milage)
// ?from&to&vehicleId(optional) → 3 sheet: รายทริป / รวมต่อคัน / แยกไซต์
export async function GET(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  const vehicleId = searchParams.get('vehicleId')

  const trips = await prisma.vehicleTrip.findMany({
    where: {
      ...(vehicleId ? { vehicleId: parseInt(vehicleId) } : {}),
      ...(from || to ? { forDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    include: {
      vehicle: { select: { licensePlate: true, name: true } },
      driver:  { select: { nickname: true, fullName: true } },
      site:    { select: { code: true, name: true } },
      booking: { select: { site: { select: { code: true, name: true } } } },
    },
    orderBy: [{ vehicleId: 'asc' }, { startedAt: 'asc' }],
  })

  // refuel logs (สำหรับค่าน้ำมันรวมต่อคัน)
  const refuels = await prisma.vehicleLog.findMany({
    where: {
      type: 'REFUEL',
      ...(vehicleId ? { vehicleId: parseInt(vehicleId) } : {}),
      ...(from || to ? { forDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    include: { vehicle: { select: { licensePlate: true, name: true } } },
    orderBy: [{ vehicleId: 'asc' }, { forDate: 'asc' }],
  })

  const purposeLabel = (p: VehiclePurpose | null) => (p ? PURPOSE_META[p].label : '')
  const dmy = (d: Date) => new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const hm  = (d: Date | null) => (d ? new Date(d).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '')

  // ── Sheet 1: รายทริป (1 แถว/ทริป) ──
  const tripRows = trips.map(t => {
    const siteCode = t.booking?.site?.code ?? t.site?.code ?? ''
    const siteName = t.booking?.site?.name ?? t.site?.name ?? ''
    return {
      'ทะเบียน': t.vehicle.licensePlate,
      'วันที่': dmy(t.forDate),
      'เวลาออก': hm(t.startedAt),
      'เวลาจอด': hm(t.endedAt),
      'ต้นทาง': t.origin ?? '',
      'ปลายทาง': t.mileageIn == null ? '(ยังไม่ปิดทริป)' : (t.destination ?? ''),
      'ไมล์ออก': t.mileageOut,
      'ไมล์จอด': t.mileageIn ?? '',
      'ระยะทาง (กม.)': t.mileageIn != null ? t.mileageIn - t.mileageOut : '',
      'ไซต์งาน': siteCode ? `${siteCode}${siteName ? ` · ${siteName}` : ''}` : (t.nonField ? `นอกงาน${t.reason ? ` (${t.reason})` : ''}` : ''),
      'ประเภทการใช้': purposeLabel(t.purpose),
      'คนขับ': t.driver?.nickname ?? t.driver?.fullName ?? t.driverName ?? '',
      'หมายเหตุ': t.notes ?? '',
      'ไมล์ไม่ตรง': t.mismatch ? `ใช่ (ระบบ ${t.expectedMileage ?? ''})` : '',
    }
  })

  // ── Sheet 2: รวมต่อคัน ──
  const perVehicle = new Map<string, { plate: string; name: string; km: number; trips: number; liters: number; cost: number; mismatch: number }>()
  for (const t of trips) {
    const key = t.vehicle.licensePlate
    if (!perVehicle.has(key)) perVehicle.set(key, { plate: t.vehicle.licensePlate, name: t.vehicle.name ?? '', km: 0, trips: 0, liters: 0, cost: 0, mismatch: 0 })
    const g = perVehicle.get(key)!
    g.trips++
    if (t.mileageIn != null) g.km += t.mileageIn - t.mileageOut
    if (t.mismatch) g.mismatch++
  }
  for (const r of refuels) {
    const key = r.vehicle.licensePlate
    if (!perVehicle.has(key)) perVehicle.set(key, { plate: r.vehicle.licensePlate, name: r.vehicle.name ?? '', km: 0, trips: 0, liters: 0, cost: 0, mismatch: 0 })
    const g = perVehicle.get(key)!
    if (r.fuelLiters) g.liters += r.fuelLiters
    if (r.fuelCost) g.cost += r.fuelCost
  }
  const vehicleRows = Array.from(perVehicle.values()).map(g => ({
    'ทะเบียน': g.plate, 'ชื่อ': g.name, 'จำนวนทริป': g.trips,
    'ระยะวิ่งรวม (กม.)': g.km, 'น้ำมัน (ลิตร)': g.liters || '', 'ค่าน้ำมัน (บาท)': g.cost || '', 'ไมล์ไม่ตรง': g.mismatch || '',
  }))

  // ── Sheet 3: แยกไซต์/งาน ──
  const perSite = new Map<string, { site: string; km: number; trips: number }>()
  for (const t of trips) {
    const siteCode = t.booking?.site?.code ?? t.site?.code ?? (t.nonField ? 'นอกงาน' : '(ไม่ระบุ)')
    if (!perSite.has(siteCode)) perSite.set(siteCode, { site: siteCode, km: 0, trips: 0 })
    const g = perSite.get(siteCode)!
    g.trips++
    if (t.mileageIn != null) g.km += t.mileageIn - t.mileageOut
  }
  const siteRows = Array.from(perSite.values())
    .sort((a, b) => b.km - a.km)
    .map(g => ({ 'ไซต์งาน': g.site, 'จำนวนทริป': g.trips, 'ระยะวิ่งรวม (กม.)': g.km }))

  const wb = XLSX.utils.book_new()
  const ws1 = XLSX.utils.json_to_sheet(tripRows.length ? tripRows : [{ 'ทะเบียน': '', 'วันที่': '', 'หมายเหตุ': 'ไม่มีข้อมูลในช่วงนี้' }])
  const ws2 = XLSX.utils.json_to_sheet(vehicleRows.length ? vehicleRows : [{ 'ทะเบียน': '', 'หมายเหตุ': 'ไม่มีข้อมูล' }])
  const ws3 = XLSX.utils.json_to_sheet(siteRows.length ? siteRows : [{ 'ไซต์งาน': '', 'หมายเหตุ': 'ไม่มีข้อมูล' }])
  ws1['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 16 }]
  ws2['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 10 }]
  ws3['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'รายทริป')
  XLSX.utils.book_append_sheet(wb, ws2, 'รวมต่อคัน')
  XLSX.utils.book_append_sheet(wb, ws3, 'แยกไซต์')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const range = `${from ?? 'all'}_${to ?? 'all'}`
  const filename = `mileage_${range}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

// เครื่องมือที่ถูกจองแล้วในช่วงวันที่เลือก — ใช้ร่วมกันระหว่างแผนพนักงาน (แนบเครื่อง) และแผนเครื่องมือ (เครื่องมือร่วม)
// ข้อมูลมาจาก GET /api/equipment-assignments/busy?start=&days=

export interface BusyRow {
  equipmentId:  number
  assignedDate: string
  siteCode:     string | null
  siteColor:    string
}

/** รวมแถวเป็น Map ต่อเครื่อง — busyByEq.get(eqId) = งานที่ทับช่วงของเครื่องนั้น */
export function groupBusyByEquipment(rows: BusyRow[]): Map<number, BusyRow[]> {
  const m = new Map<number, BusyRow[]>()
  for (const r of rows) {
    if (!m.has(r.equipmentId)) m.set(r.equipmentId, [])
    m.get(r.equipmentId)!.push(r)
  }
  return m
}

/** ข้อความ tooltip: "ถูกจองแล้ว: STS (17 ก.ค., 18 ก.ค.)" */
export function busyTitle(rows: BusyRow[]): string {
  const bySite = new Map<string, string[]>()
  for (const r of rows) {
    const code = r.siteCode ?? '—'
    if (!bySite.has(code)) bySite.set(code, [])
    bySite.get(code)!.push(new Date(r.assignedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }))
  }
  return 'ถูกจองแล้ว: ' + Array.from(bySite.entries()).map(([c, ds]) => `${c} (${ds.join(', ')})`).join(' · ')
}

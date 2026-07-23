// PDF แผนใช้รถ (A3 แนวนอน) — สีทีมผู้ใช้ + merge งานหลายวัน + คนขับ + หน้าหมายเหตุ
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { CellDef, RowInput } from 'jspdf-autotable'
import { toDateKey } from '@/lib/dateKey'
import type { Vehicle, VehicleBooking } from '@/lib/types'
import { PURPOSE_META } from '@/lib/vehiclePurpose'
import {
  registerSarabun, teamPdf, WHITE, SUNDAY_BG, HOLIDAY_BG, CONFLICT_BG, CONFLICT_TEXT,
  HEADER_BG, thaiMonths, thaiDays, addNotesPage, type RGB,
} from './pdfCommon'

export interface ExportVehiclePdfArgs {
  year: number
  month: number
  vehicles: Vehicle[]
  calendarData: Map<number, Map<string, VehicleBooking[]>>
  days: Date[]
  holidayMap: Map<string, string>
  conflicts: Set<string>   // "vehicleId-dateKey"
}

const bookingTeam = (b: VehicleBooking): string | undefined =>
  b.staffAssignment?.serviceType?.code ?? b.driver?.primaryTeam?.code
const bookingLabel = (b: VehicleBooking): string =>
  b.purpose === 'FIELD' ? (b.site?.code ?? b.destination ?? '—') : (b.destination ?? PURPOSE_META[b.purpose]?.label ?? '—')

export function exportVehiclePdf(args: ExportVehiclePdfArgs): void {
  const { year, month, vehicles, calendarData, days, holidayMap, conflicts } = args
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  registerSarabun(doc)
  const pageW = doc.internal.pageSize.getWidth()
  const nDays = days.length

  doc.setFont('Sarabun', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 41, 59)
  doc.text(`แผนใช้รถ — ${thaiMonths[month]} ${year + 543}`, 8, 10)

  const dayHead: CellDef[] = days.map(d => {
    const dow = d.getDay(), isHol = holidayMap.has(toDateKey(d))
    const c: RGB = (isHol || dow === 0) ? [220, 38, 38] : WHITE
    return { content: `${d.getDate()}\n${isHol ? 'ห' : thaiDays[dow]}`, styles: { textColor: c } }
  })
  const head: RowInput[] = [[{ content: 'รถ' }, ...dayHead, { content: 'Util\n%' } as CellDef]]

  const body: RowInput[] = vehicles.map(v => {
    const dayMap = calendarData.get(v.id)
    const row: CellDef[] = [
      { content: `${v.licensePlate}${v.name ? `\n${v.name}` : ''}`, styles: { halign: 'left', fontSize: 5.5 } },
    ]
    let i = 0, assignedDays = 0
    while (i < nDays) {
      const dateKey = toDateKey(days[i])
      const dayBook = dayMap?.get(dateKey) ?? []
      if (dayBook.length === 0) {
        const dow = days[i].getDay(), isHol = holidayMap.has(dateKey)
        row.push({ content: '', styles: { fillColor: isHol ? HOLIDAY_BG : dow === 0 ? SUNDAY_BG : WHITE } })
        i += 1; continue
      }
      const parent = dayBook.find(a => a.parentId == null && Number(a.estimatedDays) >= 2)
      let span = 1
      if (parent) {
        while (i + span < nDays) {
          const next = dayMap?.get(toDateKey(days[i + span])) ?? []
          if (!next.some(a => a.parentId === parent.id)) break
          span++
        }
      }
      let isConflict = false
      for (let k = 0; k < span; k++) if (conflicts.has(`${v.id}-${toDateKey(days[i + k])}`)) { isConflict = true; break }
      assignedDays += span

      const b = dayBook[0]
      const team = bookingTeam(b)
      let text = bookingLabel(b)
      const drv = b.driver?.nickname ?? b.driverName
      if (drv) text += `\n${drv}`
      if (span > 1 && b.parentId == null) text += ` (${Number(b.estimatedDays)} วัน)`
      const pal = team ? teamPdf(team) : { bg: [241, 245, 249] as RGB, text: [51, 65, 85] as RGB }
      const bg: RGB = isConflict ? CONFLICT_BG : pal.bg
      const txt: RGB = isConflict ? CONFLICT_TEXT : pal.text
      row.push({ content: text, colSpan: span, styles: { fillColor: bg, textColor: txt, fontSize: 5.5 } })
      i += span
    }
    const denom = days.filter(d => d.getDay() !== 0 && !holidayMap.has(toDateKey(d))).length || 1
    const util = Math.round((assignedDays / denom) * 100)
    row.push({ content: assignedDays > 0 ? `${util}` : '—', styles: { fontStyle: 'bold', textColor: [4, 120, 87] } })
    return row
  })

  const dayColWidth = (pageW - 16 - 30 - 10) / nDays
  const dayColStyles: Record<number, { cellWidth: number }> = {}
  for (let c = 0; c < nDays; c++) dayColStyles[1 + c] = { cellWidth: dayColWidth }

  autoTable(doc, {
    head, body, startY: 14, margin: { left: 8, right: 8, top: 14 }, theme: 'grid',
    styles: { font: 'Sarabun', fontStyle: 'normal', fontSize: 6, cellPadding: 0.7, halign: 'center', valign: 'middle', overflow: 'linebreak', lineColor: [0, 0, 0], lineWidth: 0.15 },
    headStyles: { font: 'Sarabun', fontStyle: 'bold', fillColor: HEADER_BG, textColor: 255, fontSize: 6, halign: 'center' },
    columnStyles: { 0: { cellWidth: 30, halign: 'left' }, ...dayColStyles, [1 + nDays]: { cellWidth: 10 } },
  })

  const noteRows: RowInput[] = []
  for (const v of vehicles) {
    const dayMap = calendarData.get(v.id)
    if (!dayMap) continue
    const seen = new Set<number>()
    for (const d of days) {
      for (const b of (dayMap.get(toDateKey(d)) ?? [])) {
        if (b.parentId != null || !b.notes || b.notes.trim() === '' || seen.has(b.id)) continue
        seen.add(b.id)
        const span = Number(b.estimatedDays) || 1
        const s = d.getDate()
        noteRows.push([v.licensePlate, `${span > 1 ? `${s}-${s + span - 1}` : s} ${thaiMonths[month]}`, bookingLabel(b), b.notes.trim()])
      }
    }
  }
  addNotesPage(doc, `หมายเหตุงาน (รถ) — ${thaiMonths[month]} ${year + 543}`, ['รถ', 'วันที่', 'งาน', 'หมายเหตุ'], noteRows, [30, 26, 30, 0], pageW)

  doc.save(`vehicle_${year}-${String(month).padStart(2, '0')}.pdf`)
}

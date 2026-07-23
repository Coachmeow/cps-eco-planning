// PDF แผนเครื่องมือ (A3 แนวนอน) — สีทีมผู้ใช้ + merge งานหลายวัน + แถบส่งซ่อม/Cal + หน้าหมายเหตุ
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { CellDef, RowInput } from 'jspdf-autotable'
import { toDateKey } from '@/lib/dateKey'
import type { Equipment, EquipmentAssignment } from '@/lib/types'
import {
  registerSarabun, teamPdf, MAINT_PDF, WHITE, SUNDAY_BG, HOLIDAY_BG, CONFLICT_BG, CONFLICT_TEXT,
  HEADER_BG, thaiMonths, thaiDays, addNotesPage, type RGB,
} from './pdfCommon'

export interface ExportEquipmentPdfArgs {
  year: number
  month: number
  equipment: Equipment[]
  calendarData: Map<number, Map<string, EquipmentAssignment[]>>
  days: Date[]
  holidayMap: Map<string, string>
  conflicts: Set<string>   // "eqId-dateKey"
  maintDayMap: Map<number, Map<string, 'REPAIR' | 'CALIBRATION'>>
}

export function exportEquipmentPdf(args: ExportEquipmentPdfArgs): void {
  const { year, month, equipment, calendarData, days, holidayMap, conflicts, maintDayMap } = args
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  registerSarabun(doc)
  const pageW = doc.internal.pageSize.getWidth()
  const nDays = days.length

  doc.setFont('Sarabun', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 41, 59)
  doc.text(`แผนเครื่องมือ — ${thaiMonths[month]} ${year + 543}`, 8, 10)

  const dayHead: CellDef[] = days.map(d => {
    const dow = d.getDay(), isHol = holidayMap.has(toDateKey(d))
    const c: RGB = (isHol || dow === 0) ? [220, 38, 38] : WHITE
    return { content: `${d.getDate()}\n${isHol ? 'ห' : thaiDays[dow]}`, styles: { textColor: c } }
  })
  const head: RowInput[] = [[{ content: 'เครื่องมือ' }, ...dayHead, { content: 'Util\n%' } as CellDef]]

  const body: RowInput[] = equipment.map(eq => {
    const dayMap = calendarData.get(eq.id)
    const mMap = maintDayMap.get(eq.id)
    const teamCode = eq.type.primaryTeam?.code ?? 'ST'
    const row: CellDef[] = [
      { content: `${eq.type.code} · ${eq.internalNo ?? eq.serialNo ?? `#${eq.id}`}${eq.isRental ? ' (เช่า)' : ''}`, styles: { halign: 'left', fontSize: 5.5 } },
    ]
    let i = 0, assignedDays = 0
    while (i < nDays) {
      const dateKey = toDateKey(days[i])
      const dayAssign = dayMap?.get(dateKey) ?? []

      if (dayAssign.length === 0) {
        // แถบส่งซ่อม/Cal (merge วันติดกันชนิดเดียวกัน)
        const mk = mMap?.get(dateKey)
        if (mk) {
          let span = 1
          while (i + span < nDays) {
            const nk = toDateKey(days[i + span])
            if ((dayMap?.get(nk)?.length ?? 0) > 0 || mMap?.get(nk) !== mk) break
            span++
          }
          const m = MAINT_PDF[mk]
          row.push({ content: m.label, colSpan: span, styles: { fillColor: m.bg, textColor: m.text, fontSize: 5.5 } })
          i += span; continue
        }
        const dow = days[i].getDay(), isHol = holidayMap.has(dateKey)
        row.push({ content: '', styles: { fillColor: isHol ? HOLIDAY_BG : dow === 0 ? SUNDAY_BG : WHITE } })
        i += 1; continue
      }

      // งานจอง (merge วันแม่ estimatedDays>=2)
      const parent = dayAssign.find(a => a.parentId == null && Number(a.estimatedDays) >= 2)
      let span = 1
      if (parent) {
        while (i + span < nDays) {
          const next = dayMap?.get(toDateKey(days[i + span])) ?? []
          if (!next.some(a => a.parentId === parent.id)) break
          span++
        }
      }
      let isConflict = false
      for (let k = 0; k < span; k++) if (conflicts.has(`${eq.id}-${toDateKey(days[i + k])}`)) { isConflict = true; break }
      assignedDays += span

      const display = dayAssign[0]
      let text = display.site?.code ?? '—'
      if (span > 1 && display.parentId == null) text += ` (${Number(display.estimatedDays)} วัน)`
      const bg: RGB = isConflict ? CONFLICT_BG : teamPdf(teamCode).bg
      const txt: RGB = isConflict ? CONFLICT_TEXT : teamPdf(teamCode).text
      row.push({ content: text, colSpan: span, styles: { fillColor: bg, textColor: txt } })
      i += span
    }
    const util = nDays > 0 ? Math.round((assignedDays / days.filter(d => d.getDay() !== 0 && !holidayMap.has(toDateKey(d))).length || 1) * 100) : 0
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

  // หน้าหมายเหตุ
  const noteRows: RowInput[] = []
  for (const eq of equipment) {
    const dayMap = calendarData.get(eq.id)
    if (!dayMap) continue
    const seen = new Set<number>()
    for (const d of days) {
      for (const a of (dayMap.get(toDateKey(d)) ?? [])) {
        if (a.parentId != null || !a.notes || a.notes.trim() === '' || seen.has(a.id)) continue
        seen.add(a.id)
        const span = Number(a.estimatedDays) || 1
        const s = d.getDate()
        noteRows.push([`${eq.type.code} · ${eq.internalNo ?? eq.serialNo ?? `#${eq.id}`}`, `${span > 1 ? `${s}-${s + span - 1}` : s} ${thaiMonths[month]}`, a.site?.code ?? '—', a.notes.trim()])
      }
    }
  }
  addNotesPage(doc, `หมายเหตุงาน (เครื่องมือ) — ${thaiMonths[month]} ${year + 543}`, ['เครื่องมือ', 'วันที่', 'ไซต์', 'หมายเหตุ'], noteRows, [40, 26, 26, 0], pageW)

  doc.save(`equipment_${year}-${String(month).padStart(2, '0')}.pdf`)
}

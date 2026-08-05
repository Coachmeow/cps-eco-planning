'use client'

/**
 * ชิ้นส่วน UI ของ "งานจองรอลูกค้ายืนยัน" — ใช้ร่วมทั้งแผนพนักงาน / เครื่องมือ / รถ
 * เพื่อให้ข้อความและหน้าตาตรงกันทั้ง 3 หน้าจอ แก้ที่เดียวมีผลหมด
 */

/** ช่องติ๊ก + ช่องเหตุผล — ใช้ในฟอร์มสร้างงาน */
export function TentativeField({
  checked, onCheckedChange, reason, onReasonChange,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  reason: string
  onReasonChange: (v: string) => void
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={checked} onChange={e => onCheckedChange(e.target.checked)} className="h-4 w-4" />
        <span>⏳ งานจอง — รอลูกค้ายืนยัน</span>
      </label>
      {checked && (
        <input type="text" value={reason} onChange={e => onReasonChange(e.target.value)}
          placeholder="เหตุผลที่ยังไม่ยืนยัน (ไม่บังคับ)"
          className="mt-2 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-slate-300 focus:outline-none" />
      )}
    </div>
  )
}

/** แถบสถานะ + ปุ่มยืนยัน — ใช้ในรายการงานที่มีอยู่ */
export function TentativeRow({
  reason, canEdit, busy, wholeJob = false, onConfirm,
}: {
  reason: string | null
  canEdit: boolean
  busy: boolean
  wholeJob?: boolean
  onConfirm: () => void
}) {
  return (
    <div className="mt-1 flex items-start justify-between gap-2 rounded border border-dashed border-red-400 bg-red-50/50 px-2 py-1.5">
      <div className="min-w-0 text-[11px]">
        <p className="font-medium text-red-600">⏳ รอลูกค้ายืนยัน</p>
        {reason && <p className="mt-0.5 break-words text-slate-600">{reason}</p>}
      </div>
      {canEdit && (
        <button onClick={onConfirm} disabled={busy}
          className="shrink-0 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? '...' : wholeJob ? '✓ ยืนยันทั้งงาน' : '✓ ยืนยันงาน'}
        </button>
      )}
    </div>
  )
}

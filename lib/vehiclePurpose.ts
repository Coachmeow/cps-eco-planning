import type { VehiclePurpose } from './types'

export const PURPOSE_META: Record<VehiclePurpose, { label: string; icon: string; cell: string; chip: string }> = {
  FIELD:    { label: 'ออกงาน',   icon: '🏭', cell: 'bg-emerald-50 border border-emerald-200 text-emerald-800', chip: 'bg-emerald-100 text-emerald-700' },
  SAMPLE:   { label: 'ส่งตัวอย่าง', icon: '🧪', cell: 'bg-violet-50  border border-violet-200  text-violet-800',  chip: 'bg-violet-100 text-violet-700' },
  DELIVERY: { label: 'ส่งของ',    icon: '📦', cell: 'bg-amber-50   border border-amber-200   text-amber-800',   chip: 'bg-amber-100 text-amber-700' },
  SHUTTLE:  { label: 'รับ-ส่งพนง.', icon: '🚐', cell: 'bg-sky-50     border border-sky-200     text-sky-800',     chip: 'bg-sky-100 text-sky-700' },
  OTHER:    { label: 'อื่นๆ',     icon: '•',  cell: 'bg-slate-50   border border-slate-200   text-slate-700',   chip: 'bg-slate-100 text-slate-600' },
}

export const PURPOSE_ORDER: VehiclePurpose[] = ['FIELD', 'SAMPLE', 'DELIVERY', 'SHUTTLE', 'OTHER']

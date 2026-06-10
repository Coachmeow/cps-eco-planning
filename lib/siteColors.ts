// Single source of truth for site color → Tailwind class mapping.
// Used by CalendarCell (staff) and EquipmentCell (equipment).
// All class strings must be fully written out (no dynamic interpolation) to survive Tailwind purge.

export const SITE_COLOR_CLASS: Record<string, string> = {
  emerald: 'bg-emerald-50 border border-emerald-200 text-emerald-800',
  sky:     'bg-sky-50     border border-sky-200     text-sky-800',
  violet:  'bg-violet-50  border border-violet-200  text-violet-800',
  rose:    'bg-rose-50    border border-rose-200    text-rose-800',
  amber:   'bg-amber-50   border border-amber-200   text-amber-800',
  orange:  'bg-orange-50  border border-orange-200  text-orange-800',
  cyan:    'bg-cyan-50    border border-cyan-200    text-cyan-800',
  indigo:  'bg-indigo-50  border border-indigo-200  text-indigo-800',
  pink:    'bg-pink-50    border border-pink-200    text-pink-800',
  teal:    'bg-teal-50    border border-teal-200    text-teal-800',
  lime:    'bg-lime-50    border border-lime-200    text-lime-800',
  red:     'bg-red-50     border border-red-200     text-red-800',
}

/** Returns the Tailwind classes for a given site color key, fallback to emerald. */
export function siteColorClass(color: string | null | undefined): string {
  return SITE_COLOR_CLASS[color ?? 'emerald'] ?? SITE_COLOR_CLASS.emerald
}

// Color palette options for Admin color picker (used in AdminView.tsx)
export const SITE_COLOR_OPTIONS = [
  { value: 'emerald', label: 'เขียว',    dot: 'bg-emerald-400', preview: 'bg-emerald-50 border-emerald-300 text-emerald-800' },
  { value: 'sky',     label: 'ฟ้า',      dot: 'bg-sky-400',     preview: 'bg-sky-50 border-sky-300 text-sky-800' },
  { value: 'violet',  label: 'ม่วง',     dot: 'bg-violet-400',  preview: 'bg-violet-50 border-violet-300 text-violet-800' },
  { value: 'rose',    label: 'ชมพูเข้ม', dot: 'bg-rose-400',    preview: 'bg-rose-50 border-rose-300 text-rose-800' },
  { value: 'amber',   label: 'เหลือง',   dot: 'bg-amber-400',   preview: 'bg-amber-50 border-amber-300 text-amber-800' },
  { value: 'orange',  label: 'ส้ม',      dot: 'bg-orange-400',  preview: 'bg-orange-50 border-orange-300 text-orange-800' },
  { value: 'cyan',    label: 'ฟ้าอ่อน',  dot: 'bg-cyan-400',    preview: 'bg-cyan-50 border-cyan-300 text-cyan-800' },
  { value: 'indigo',  label: 'คราม',     dot: 'bg-indigo-400',  preview: 'bg-indigo-50 border-indigo-300 text-indigo-800' },
  { value: 'pink',    label: 'ชมพู',     dot: 'bg-pink-400',    preview: 'bg-pink-50 border-pink-300 text-pink-800' },
  { value: 'teal',    label: 'เขียวน้ำ', dot: 'bg-teal-400',    preview: 'bg-teal-50 border-teal-300 text-teal-800' },
  { value: 'lime',    label: 'เขียวสด',  dot: 'bg-lime-400',    preview: 'bg-lime-50 border-lime-300 text-lime-800' },
  { value: 'red',     label: 'แดง',      dot: 'bg-red-400',     preview: 'bg-red-50 border-red-300 text-red-800' },
]

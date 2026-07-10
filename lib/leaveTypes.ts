// ประเภทการลา (ฟิลด์ leaveType เมื่อ status=LEAVE) — ชื่อเต็มใช้ใน dropdown ; ตัวย่อใช้ในช่องปฏิทิน/PDF
export const LEAVE_TYPES: { value: string; label: string; abbr: string }[] = [
  { value: 'SICK',      label: 'ลาป่วย (ไม่มีใบรับรองแพทย์)', abbr: 'ป'  },
  { value: 'SICK_CERT', label: 'ลาป่วย (มีใบรับรองแพทย์)',    abbr: 'ป✓' },
  { value: 'PERSONAL',  label: 'ลากิจ',                        abbr: 'ก'  },
  { value: 'VACATION',  label: 'ลาพักร้อน',                    abbr: 'พร' },
  { value: 'UNPAID',    label: 'ลาไม่รับค่าจ้าง',              abbr: 'ลจ' },
]

export const LEAVE_ABBR:  Record<string, string> = Object.fromEntries(LEAVE_TYPES.map(l => [l.value, l.abbr]))
export const LEAVE_LABEL: Record<string, string> = Object.fromEntries(LEAVE_TYPES.map(l => [l.value, l.label]))

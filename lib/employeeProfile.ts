// คำนวณอายุ / อายุงาน + ฟอร์แมตวันที่ไทย (พ.ศ.) สำหรับการ์ดประวัติพนักงาน

export function calcAge(birth?: string | null): string | null {
  if (!birth) return null
  const b = new Date(birth)
  const now = new Date()
  let years = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) years--
  return years >= 0 ? `${years} ปี` : null
}

export function calcDuration(start?: string | null): string | null {
  if (!start) return null
  const s = new Date(start)
  const now = new Date()
  let months = (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth())
  if (now.getDate() < s.getDate()) months--
  if (months < 0) months = 0
  const y = Math.floor(months / 12)
  const mo = months % 12
  if (y === 0) return `${mo} เดือน`
  if (mo === 0) return `${y} ปี`
  return `${y} ปี ${mo} เดือน`
}

// th-TH ให้ปี พ.ศ. อัตโนมัติ
export function fmtThaiDate(d?: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function countWorkdays(year: number, month: number): number {
  const total = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= total; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

export function calcUtil(assignedDays: number, workdays: number): number {
  if (workdays === 0) return 0
  return Math.round((assignedDays / workdays) * 100)
}

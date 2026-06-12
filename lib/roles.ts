// Role type + labels — pure constants, safe to import in client components
// (no jose / node deps), used by both server and client code.
export type UserRole = 'ADMIN' | 'MANAGER' | 'MAINTENANCE' | 'GENERAL'

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN:       'ผู้ดูแลระบบ',
  MANAGER:     'ผู้จัดการแผนงาน',
  MAINTENANCE: 'ช่างเครื่องมือ',
  GENERAL:     'พนักงานทั่วไป',
}

export const ROLE_ORDER: UserRole[] = ['ADMIN', 'MANAGER', 'MAINTENANCE', 'GENERAL']

export function canPlan(role?: UserRole | null): boolean {
  return role === 'ADMIN' || role === 'MANAGER'
}

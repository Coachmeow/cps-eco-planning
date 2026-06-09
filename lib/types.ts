export type TeamCode = 'ST' | 'AMB' | 'WP' | 'CEMS' | 'WT' | 'LOG'

export interface ServiceTeam {
  id: number
  code: TeamCode
  name: string
}

export interface Employee {
  id: number
  fullName: string
  nickname: string | null
  primaryTeamId: number
  primaryTeam: ServiceTeam
  siteAccess: EmployeeSiteAccess[]
}

export interface EmployeeSiteAccess {
  id: number
  siteCode: string
  expiryDate: string
}

export interface Site {
  id: number
  code: string
  name: string
}

export type AssignmentStatus = 'FIELD' | 'OFFICE' | 'LEAVE' | 'HOLIDAY' | 'CAL' | 'TRAINING'

export interface StaffAssignment {
  id: number
  employeeId: number
  assignedDate: string
  siteId: number | null
  site: Site | null
  serviceTypeId: number | null
  serviceType: ServiceTeam | null
  isCrossTeam: boolean
  estimatedDays: number
  status: AssignmentStatus
  notes: string | null
  isLocked: boolean
  parentId: number | null
}

export type CalendarData = Map<number, Map<string, StaffAssignment[]>>

export interface ConflictSet {
  staffConflicts: Set<string>
  equipmentConflicts: Set<string>
}

export type EquipmentStatus = 'ACTIVE' | 'CALIBRATING' | 'BROKEN' | 'RETIRED'

export interface EquipmentType {
  id: number
  code: string
  name: string
  primaryTeamId: number
  primaryTeam: ServiceTeam
}

export interface Equipment {
  id: number
  typeId: number
  type: EquipmentType
  serialNo: string | null
  internalNo: string | null
  isRental: boolean
  rentalVendor: string | null
  status: EquipmentStatus
  notes: string | null
}

export interface EquipmentAssignment {
  id: number
  equipmentId: number
  assignedDate: string
  siteId: number | null
  site: Site | null
  staffAssignmentId: number | null
  notes: string | null
  isLocked: boolean
  equipment: Equipment
}

export type EquipmentCalendarData = Map<number, Map<string, EquipmentAssignment[]>>

export interface EquipmentUtilRow {
  typeId: number
  typeCode: string
  typeName: string
  ownCount: number
  rentalCount: number
  ownAssigned: number
  rentalAssigned: number
  ownUtil: number
  rentalUtil: number
}

export interface TeamWorkloadRow {
  teamId: number
  teamCode: string
  teamName: string
  demand: number
  ownCap: number
  crossIn: number
}

export interface CrossContribRow {
  employeeId: number
  fullName: string
  nickname: string
  primaryTeam: string
  crossTeamDays: number
}

export interface DashboardData {
  equipmentUtil: EquipmentUtilRow[]
  teamWorkload: TeamWorkloadRow[]
  crossContrib: CrossContribRow[]
  workdays: number
  year: number
  month: number
}

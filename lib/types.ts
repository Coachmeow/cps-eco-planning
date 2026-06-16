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
  isActive?: boolean
  phone?: string | null
  hasPhoto?: boolean
  birthDate?: string | null
  startDate?: string | null
  eduField?: string | null
  eduInstitute?: string | null
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
  color: string | null
  province: string | null
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
  rentalStartDate: string | null
  rentalEndDate: string | null
  status: EquipmentStatus
  notes: string | null
  brand?: string | null
  model?: string | null
  vendor?: string | null
  purchaseDate?: string | null
  purchasePrice?: number | null
  lifespanYears?: number | null
  calDueDate?: string | null
  hasPhoto?: boolean
}

export type EquipmentEventType = 'REPAIR' | 'CALIBRATION'

export interface EquipmentEvent {
  id: number
  equipmentId: number
  type: EquipmentEventType
  sentDate: string
  expectedDate: string | null
  returnedDate: string | null
  nextDueDate: string | null
  vendor: string | null
  cost: number | null
  notes: string | null
  equipment?: Equipment
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
  estimatedDays: number
  parentId: number | null
  equipment: Equipment
}

export type EquipmentCalendarData = Map<number, Map<string, EquipmentAssignment[]>>

// ── Vehicle ─────────────────────────────────────────────────
export type VehicleStatus  = 'ACTIVE' | 'MAINTENANCE' | 'RETIRED'
export type VehiclePurpose = 'FIELD' | 'SAMPLE' | 'DELIVERY' | 'SHUTTLE' | 'OTHER'

export interface Vehicle {
  id: number
  licensePlate: string
  name: string | null
  vehicleType: string | null
  brand: string | null
  model: string | null
  seats: number | null
  status: VehicleStatus
  notes: string | null
  hasPhoto?: boolean
}

export interface VehicleBooking {
  id: number
  vehicleId: number
  vehicle: Vehicle
  assignedDate: string
  estimatedDays: number
  parentId: number | null
  purpose: VehiclePurpose
  siteId: number | null
  site: Site | null
  destination: string | null
  staffAssignmentId: number | null
  driverId: number | null
  driver: Employee | null
  driverName: string | null
  notes: string | null
}

export type VehicleCalendarData = Map<number, Map<string, VehicleBooking[]>>

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
  demandUtil: number | null
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

export interface PersonUtilRow {
  employeeId: number
  fullName: string
  nickname: string
  primaryTeam: string
  fieldDays: number
  utilPct: number
}

export interface SiteMandayRow {
  siteId: number
  siteCode: string
  siteName: string
  color: string
  manDays: number
}

export interface TeamCapacityRow {
  teamId: number
  teamCode: string
  headcount: number
  capacity: number
  booked: number
  remaining: number
  usedPct: number
}

export interface TrendPoint {
  year: number
  month: number
  manDays: number
  eqUtil: number
}

export interface DashboardAlerts {
  calOverdue: number
  calSoon: number
  repairOverdue: number
  stillOut: number
}

export interface DashboardData {
  equipmentUtil: EquipmentUtilRow[]
  teamWorkload: TeamWorkloadRow[]
  crossContrib: CrossContribRow[]
  personUtil: PersonUtilRow[]
  siteMandays: SiteMandayRow[]
  teamCapacity: TeamCapacityRow[]
  trend: TrendPoint[]
  alerts?: DashboardAlerts
  workdays: number
  year: number
  month: number
}

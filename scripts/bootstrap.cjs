/**
 * Bootstrap accounts — รันอัตโนมัติตอน start บน Railway (idempotent, plain JS)
 * ใช้แค่ @prisma/client + node:crypto (ไม่ต้องพึ่ง ts-node)
 *
 *   1) upsert admin "anuwat" (รหัส @Dew28)
 *   2) สร้างบัญชี GENERAL ให้พนักงานที่ยังไม่มี user (ข้ามที่มีอยู่แล้ว)
 *
 * ไม่ลบข้อมูลใดๆ — รันซ้ำทุก deploy ได้
 */
const { PrismaClient } = require('@prisma/client')
const { randomBytes, scryptSync } = require('node:crypto')
const prisma = new PrismaClient()

function hashPassword(pw) {
  const salt = randomBytes(16)
  const hash = scryptSync(pw, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

// ลำดับตรงกับ prisma/seed.ts (employee id asc)
const USERNAMES = [
  'kaewkanok', 'anirut', 'sompong', 'surasak', 'kit', 'navin',
  'montri', 'nirun', 'jirayu', 'thawatchai', 'niphon', 'wanchai',
  'nattapong', 'prawit', 'thanasin', 'sutat', 'anuchet', 'nattawut',
  'thanapon', 'athikom', 'phaiboon',
  'thitipong', 'thanapon2', 'amornthep', 'nopadol', 'kritsanapol', 'supanat', 'narongrit',
  'manorom', 'nattawut2', 'anapat', 'wuttisak', 'wararat',
  'pramote', 'woramet', 'krittapop', 'rittichai',
  'chattarika', 'wiparat', 'danuchit', 'sasiyapat',
]

async function main() {
  // 1) admin anuwat
  await prisma.user.upsert({
    where:  { username: 'anuwat' },
    update: { passwordHash: hashPassword('@Dew28'), role: 'ADMIN', isActive: true },
    create: { username: 'anuwat', passwordHash: hashPassword('@Dew28'), role: 'ADMIN', isActive: true },
  })
  console.log('✅ admin "anuwat" พร้อมใช้งาน')

  // 2) backfill บัญชีพนักงาน (GENERAL) สำหรับคนที่ยังไม่มี user
  const employees     = await prisma.employee.findMany({ orderBy: { id: 'asc' } })
  const existingUsers = await prisma.user.findMany({ select: { employeeId: true, username: true } })
  const takenEmp  = new Set(existingUsers.map((u) => u.employeeId))
  const takenName = new Set(existingUsers.map((u) => u.username))
  const defaultHash = hashPassword('4321')

  let created = 0
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i]
    if (takenEmp.has(emp.id)) continue

    let username = USERNAMES[i] || `user${emp.id}`
    let n = 2
    while (takenName.has(username)) username = `${USERNAMES[i] || `user${emp.id}`}${n++}`
    takenName.add(username)

    await prisma.user.create({
      data: { username, passwordHash: defaultHash, role: 'GENERAL', employeeId: emp.id },
    })
    created++
  }
  console.log(`✅ สร้างบัญชีพนักงานใหม่ ${created} ราย (ข้ามที่มีอยู่แล้ว ${takenEmp.size} ราย)`)

  // 3) backfill ลำดับทีม (ST→AMB→WP→WT→CEMS→LOG) — ทีมอื่นคง default 999 (ต่อท้าย)
  const TEAM_ORDER = { ST: 1, AMB: 2, WP: 3, WT: 4, CEMS: 5, LOG: 6 }
  for (const [code, sortOrder] of Object.entries(TEAM_ORDER)) {
    await prisma.serviceTeam.updateMany({ where: { code }, data: { sortOrder } })
  }
  console.log('✅ อัปเดตลำดับทีมแล้ว')

  // 4) ล้างงานภาคสนาม (FIELD) ที่ไม่มีไซต์ — ข้อมูลค้างที่โชว์เป็น "FIELD" และไปโป่ง utilization
  //    idempotent: หลังเพิ่ม validation จะไม่มีเกิดใหม่ ; ลบซ้ำทุก deploy ปลอดภัย
  const fieldless = await prisma.staffAssignment.findMany({
    where:  { status: 'FIELD', siteId: null },
    select: { id: true },
  })
  if (fieldless.length > 0) {
    const ids = fieldless.map((a) => a.id)
    // ตัดสายผูกเครื่อง/รถ กัน FK ก่อนลบ
    await prisma.equipmentAssignment.updateMany({ where: { staffAssignmentId: { in: ids } }, data: { staffAssignmentId: null } })
    await prisma.vehicleBooking.updateMany({ where: { staffAssignmentId: { in: ids } }, data: { staffAssignmentId: null } })
    // ลบตัวลูกก่อน (parentId ไม่ null) แล้วค่อยลบตัวแม่ กัน FK self-relation
    await prisma.staffAssignment.deleteMany({ where: { status: 'FIELD', siteId: null, parentId: { not: null } } })
    await prisma.staffAssignment.deleteMany({ where: { status: 'FIELD', siteId: null } })
    console.log(`🧹 ลบงาน FIELD ไร้ไซต์ ${ids.length} รายการ`)
  } else {
    console.log('🧹 ไม่มีงาน FIELD ไร้ไซต์ค้าง')
  }

  // 5) นำเข้าอะไหล่ CEMS จากไฟล์ Excel เดิม (ครั้งเดียว — เมื่อ stock ยังว่าง)
  //    ยอดตั้งต้น = txn IN 1 รายการ note "ยอดยกมาจาก Excel"
  const partCount = await prisma.cemsSparePart.count()
  if (partCount === 0) {
    let seed = []
    try { seed = require('./cems-parts-seed.json') } catch { seed = [] }
    let n = 0
    for (const p of seed) {
      const part = await prisma.cemsSparePart.create({
        data: {
          code: p.code, name: p.name, brand: p.brand || null, unit: p.unit || null,
          minStock: p.minStock || 0, location: p.location || null,
          refCost: p.refCost != null ? p.refCost : null,
          notes: p.origCode ? `รหัสเดิมในไฟล์: ${p.origCode}` : null,
        },
      })
      if (p.openingStock > 0) {
        await prisma.cemsPartTxn.create({
          data: {
            partId: part.id, type: 'IN', qty: p.openingStock,
            unitCost: p.refCost != null ? p.refCost : null,
            txnDate: new Date('2026-07-03'), notes: 'ยอดยกมาจาก Excel',
          },
        })
      }
      n++
    }
    console.log(`📥 นำเข้าอะไหล่ CEMS ${n} รายการ (ครั้งแรก)`)
  } else {
    console.log(`📥 อะไหล่ CEMS มีอยู่แล้ว ${partCount} รายการ (ข้ามการนำเข้า)`)
  }
}

main()
  .catch((e) => { console.error('bootstrap error:', e); process.exit(0) }) // ไม่ block การ start แอป
  .finally(() => prisma.$disconnect())

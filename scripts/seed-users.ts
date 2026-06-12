/**
 * Non-destructive user backfill — สร้างบัญชี User ให้พนักงานที่ยังไม่มี
 * โดยไม่ลบข้อมูลอื่นใด (ปลอดภัยกับ production DB ที่มีแผนงานจริง)
 *
 * รัน:  npm run seed:users
 *
 * - พนักงานที่มี user แล้ว → ข้าม
 * - รหัสเริ่มต้นทุกคน = 4321
 * - role เริ่มต้น = GENERAL
 * - ถ้ายังไม่มี ADMIN ในระบบเลย → ตั้งคนแรก (id น้อยสุด) เป็น ADMIN
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'node:crypto'
const prisma = new PrismaClient()

function hashPassword(pw: string): string {
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
  const employees = await prisma.employee.findMany({ orderBy: { id: 'asc' } })
  const existingUsers = await prisma.user.findMany({ select: { employeeId: true, username: true } })
  const takenEmp = new Set(existingUsers.map((u) => u.employeeId))
  const takenName = new Set(existingUsers.map((u) => u.username))
  const anyAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })

  const defaultHash = hashPassword('4321')
  let created = 0
  let madeAdmin = false

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i]
    if (takenEmp.has(emp.id)) continue

    // หา username ที่ไม่ชนของเดิม
    let username = USERNAMES[i] ?? `user${emp.id}`
    let n = 2
    while (takenName.has(username)) { username = `${USERNAMES[i] ?? `user${emp.id}`}${n++}` }
    takenName.add(username)

    const makeAdmin = !anyAdmin && !madeAdmin   // bootstrap admin ถ้ายังไม่มีเลย
    if (makeAdmin) madeAdmin = true

    await prisma.user.create({
      data: {
        username,
        passwordHash: defaultHash,
        role:         makeAdmin ? 'ADMIN' : 'GENERAL',
        employeeId:   emp.id,
      },
    })
    console.log(`  + ${username}  →  ${emp.nickname ?? emp.fullName}${makeAdmin ? '  [ADMIN]' : ''}`)
    created++
  }

  console.log(`✅ สร้างบัญชีใหม่ ${created} ราย (ข้ามที่มีอยู่แล้ว ${takenEmp.size} ราย)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

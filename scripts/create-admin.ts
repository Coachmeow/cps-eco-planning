/**
 * สร้าง/อัปเดตบัญชี Admin แบบ standalone (ไม่ผูกกับพนักงาน)
 * idempotent — รันซ้ำได้ จะอัปเดตรหัส/สิทธิ์ให้เป็นปัจจุบัน
 *
 * รัน:  npm run create:admin
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'node:crypto'
const prisma = new PrismaClient()

function hashPassword(pw: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(pw, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

// แก้ค่าตรงนี้ได้ถ้าต้องการสร้าง admin คนอื่น
const USERNAME = 'anuwat'
const PASSWORD = '@Dew28'

async function main() {
  const passwordHash = hashPassword(PASSWORD)
  const user = await prisma.user.upsert({
    where:  { username: USERNAME },
    update: { passwordHash, role: 'ADMIN', isActive: true },
    create: { username: USERNAME, passwordHash, role: 'ADMIN', isActive: true },
  })
  console.log(`✅ Admin "${user.username}" พร้อมใช้งาน (role=${user.role})`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

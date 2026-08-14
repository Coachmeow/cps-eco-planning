/**
 * MIGRATION (ครั้งเดียว) — แปลง "ใบงาน Cal ที่วันส่งเป็นอนาคต" ให้เป็น "แผน Cal" (calDueDate)
 *
 *   ทำอะไร (เฉพาะใบงาน type=CALIBRATION, ยังไม่รับกลับ, วันส่ง > วันนี้):
 *     1) ตั้ง equipment.calDueDate = วันส่งที่เร็วที่สุดของเครื่องนั้น (= วันแผน)
 *     2) ลบใบงาน future Cal เหล่านั้นทิ้ง (เพราะมันคือ "แผน" ไม่ใช่ "ส่งจริง")
 *     3) คำนวณสถานะเครื่องใหม่จากใบงานที่เหลือ (กันเครื่องที่มีงานซ่อมค้างจริงโดนเซ็ต ACTIVE ผิด)
 *
 *   ไม่แตะ: ใบงานซ่อม · ใบงาน Cal ที่เลยวันส่งแล้ว (อยู่ศูนย์จริง) · ประวัติที่รับกลับแล้ว
 *
 *   ปลอดภัย:
 *     - ค่าเริ่มต้น = DRY-RUN (พิมพ์ว่าจะทำอะไร ไม่เขียนจริง)
 *     - ใส่ --apply ถึงจะเขียนจริง และทำใน $transaction เดียว (ล้มเหลว = ไม่เปลี่ยนอะไรเลย)
 *     - ก่อนเขียนจริง เซฟ backup ใบงานที่จะลบ + สถานะเครื่องเดิม ลงไฟล์ JSON
 *
 *   รัน:
 *     node scripts/migrate-cal-plan.cjs           ← ดูก่อน (ไม่เขียน)
 *     node scripts/migrate-cal-plan.cjs --apply   ← ทำจริง
 */
const { PrismaClient } = require('@prisma/client')
const fs = require('node:fs')
const path = require('node:path')
const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')
const hostOf = (u) => { try { const x = new URL(u); return `${x.hostname}:${x.port || ''}${x.pathname}` } catch { return '(parse ไม่ได้)' } }
const key = (d) => new Date(d).toISOString().slice(0, 10)

async function main() {
  console.log('โหมด    :', APPLY ? '🔴 APPLY (เขียนจริง)' : '🟢 DRY-RUN (ดูอย่างเดียว ไม่เขียน)')
  console.log('DB HOST :', hostOf(process.env.DATABASE_URL || ''))
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayKey = today.toISOString().slice(0, 10)
  console.log('วันนี้   :', todayKey, '\n')

  // ใบงาน Cal ที่วันส่งเป็นอนาคต = "แผน" ที่ต้องแปลง
  const futureCal = await prisma.equipmentEvent.findMany({
    where: { type: 'CALIBRATION', returnedDate: null, sentDate: { gt: today } },
    include: { equipment: { select: { id: true, internalNo: true, serialNo: true, status: true, calDueDate: true } } },
    orderBy: [{ equipmentId: 'asc' }, { sentDate: 'asc' }],
  })

  if (futureCal.length === 0) {
    console.log('ไม่มีใบงาน Cal วันส่งอนาคตให้แปลง — จบ (อาจแปลงไปแล้ว)')
    return
  }

  // group ต่อเครื่อง → วันแผน = วันส่งเร็วสุด, รวม id ใบงานที่จะลบ
  const byEq = new Map()
  for (const ev of futureCal) {
    if (!byEq.has(ev.equipmentId)) byEq.set(ev.equipmentId, { eq: ev.equipment, events: [] })
    byEq.get(ev.equipmentId).events.push(ev)
  }

  console.log(`พบใบงาน Cal อนาคต ${futureCal.length} ใบ · ครอบคลุม ${byEq.size} เครื่อง\n`)
  console.log('เครื่อง                 calDueDate เดิม → ใหม่           ลบใบงาน  หมายเหตุ')
  console.log('─'.repeat(78))
  const plan = []
  for (const { eq, events } of byEq.values()) {
    const name = (eq.internalNo ?? eq.serialNo ?? `#${eq.id}`).padEnd(22)
    const newDue = key(events[0].sentDate)           // เร็วสุด (events เรียง sentDate asc แล้ว)
    const oldDue = eq.calDueDate ? key(eq.calDueDate) : '—'
    const note = eq.calDueDate ? '⚠ มีแผนเดิม จะถูกทับ' : ''
    console.log(`${name} ${oldDue.padStart(10)} → ${newDue.padStart(10)}      ${String(events.length).padStart(2)} ใบ    ${note}`)
    plan.push({ equipmentId: eq.id, newDue, eventIds: events.map(e => e.id) })
  }
  console.log('─'.repeat(78))
  console.log(`รวม: ตั้งแผน ${byEq.size} เครื่อง · ลบใบงาน ${futureCal.length} ใบ\n`)

  if (!APPLY) {
    console.log('👉 นี่คือ DRY-RUN ยังไม่เขียนอะไร ถ้าถูกต้องแล้วรันซ้ำด้วย --apply')
    return
  }

  // ── APPLY ──
  // backup ก่อนแตะ
  const backupDir = path.join(__dirname, '_backup')
  fs.mkdirSync(backupDir, { recursive: true })
  const backupFile = path.join(backupDir, `cal-plan-migration-${Date.now()}.json`)
  fs.writeFileSync(backupFile, JSON.stringify({
    at: new Date().toISOString(),
    deletedEvents: futureCal.map(e => ({
      id: e.id, equipmentId: e.equipmentId, type: e.type,
      sentDate: e.sentDate, expectedDate: e.expectedDate, nextDueDate: e.nextDueDate,
      vendor: e.vendor, cost: e.cost, notes: e.notes,
    })),
    equipmentBefore: Array.from(byEq.values()).map(({ eq }) => ({ id: eq.id, status: eq.status, calDueDate: eq.calDueDate })),
  }, null, 2))
  console.log(`💾 backup แล้ว: ${backupFile}\n`)

  await prisma.$transaction(async (tx) => {
    for (const { equipmentId, newDue, eventIds } of plan) {
      // 1) ตั้งแผน
      await tx.equipment.update({ where: { id: equipmentId }, data: { calDueDate: new Date(newDue) } })
      // 2) ลบใบงาน future Cal
      await tx.equipmentEvent.deleteMany({ where: { id: { in: eventIds } } })
      // 3) คำนวณสถานะใหม่จากใบงานที่เหลือ (ที่ถึงวันส่งแล้ว) — RETIRED คงเดิม
      const eq = await tx.equipment.findUnique({ where: { id: equipmentId }, select: { status: true } })
      if (eq.status !== 'RETIRED') {
        const started = await tx.equipmentEvent.findMany({
          where: { equipmentId, returnedDate: null, sentDate: { lte: today } },
          select: { type: true },
        })
        const hasRepair = started.some(e => e.type === 'REPAIR')
        const hasCal    = started.some(e => e.type === 'CALIBRATION')
        const status = hasRepair ? 'BROKEN' : hasCal ? 'CALIBRATING' : 'ACTIVE'
        await tx.equipment.update({ where: { id: equipmentId }, data: { status } })
      }
    }
  })

  // สรุปหลังทำ
  const remaining = await prisma.equipmentEvent.count({ where: { type: 'CALIBRATION', returnedDate: null, sentDate: { gt: today } } })
  const planned = await prisma.equipment.count({ where: { calDueDate: { not: null } } })
  console.log('✅ เสร็จแล้ว')
  console.log(`   ใบงาน Cal อนาคตที่เหลือ (ควรเป็น 0): ${remaining}`)
  console.log(`   เครื่องที่มีแผน calDueDate ตอนนี้    : ${planned}`)
}

main().catch(e => { console.error('❌ error:', e); process.exit(1) }).finally(() => prisma.$disconnect())

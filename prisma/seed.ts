import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const teams = await Promise.all([
    prisma.serviceTeam.upsert({ where: { code: 'ST'   }, update: {}, create: { code: 'ST',   name: 'Stack'     } }),
    prisma.serviceTeam.upsert({ where: { code: 'AMB'  }, update: {}, create: { code: 'AMB',  name: 'Ambient'   } }),
    prisma.serviceTeam.upsert({ where: { code: 'WP'   }, update: {}, create: { code: 'WP',   name: 'Workplace' } }),
    prisma.serviceTeam.upsert({ where: { code: 'CEMS' }, update: {}, create: { code: 'CEMS', name: 'CEMS'      } }),
    prisma.serviceTeam.upsert({ where: { code: 'WT'   }, update: {}, create: { code: 'WT',   name: 'Water'     } }),
    prisma.serviceTeam.upsert({ where: { code: 'LOG'  }, update: {}, create: { code: 'LOG',  name: 'Logistic'  } }),
  ])
  const [ST, AMB, WP,, WT] = teams

  const eqTypes = await Promise.all([
    prisma.equipmentType.upsert({ where: { code: 'TSP'   }, update: {}, create: { code: 'TSP',   name: 'TSP Sampler',      primaryTeamId: ST.id  } }),
    prisma.equipmentType.upsert({ where: { code: 'PM10'  }, update: {}, create: { code: 'PM10',  name: 'PM10 Sampler',     primaryTeamId: AMB.id } }),
    prisma.equipmentType.upsert({ where: { code: 'Sound' }, update: {}, create: { code: 'Sound', name: 'Sound Level Meter', primaryTeamId: WP.id  } }),
    prisma.equipmentType.upsert({ where: { code: 'Heat'  }, update: {}, create: { code: 'Heat',  name: 'Heat Stress Meter', primaryTeamId: WP.id  } }),
    prisma.equipmentType.upsert({ where: { code: 'DO'    }, update: {}, create: { code: 'DO',    name: 'DO Meter',          primaryTeamId: WT.id  } }),
  ])
  const [TSP,, Sound] = eqTypes

  await prisma.equipment.createMany({
    skipDuplicates: true,
    data: [
      { typeId: TSP.id,   internalNo: 'TSP No.4',    serialNo: 'SN-TSP-004', isRental: false, status: 'ACTIVE' },
      { typeId: TSP.id,   internalNo: 'TSP No.17',   serialNo: 'SN-TSP-017', isRental: false, status: 'ACTIVE' },
      { typeId: TSP.id,   internalNo: 'เช่า No.1',   isRental: true,  rentalVendor: 'บ. ABC', status: 'ACTIVE' },
      { typeId: Sound.id, internalNo: 'Sound No.26', serialNo: 'SN-SND-026', isRental: false, status: 'ACTIVE' },
    ],
  })

  await Promise.all([
    prisma.employee.upsert({ where: { id: 1 }, update: {}, create: { id: 1, fullName: 'แก้วกนก สุขใจ',  nickname: 'แก้ว', primaryTeamId: ST.id,  isActive: true } }),
    prisma.employee.upsert({ where: { id: 2 }, update: {}, create: { id: 2, fullName: 'ประวิช มีสุข',    nickname: 'วิช',  primaryTeamId: AMB.id, isActive: true } }),
    prisma.employee.upsert({ where: { id: 3 }, update: {}, create: { id: 3, fullName: 'สมชาย ดีงาม',    nickname: 'ชาย',  primaryTeamId: WP.id,  isActive: true } }),
    prisma.employee.upsert({ where: { id: 4 }, update: {}, create: { id: 4, fullName: 'มาลี รักงาน',    nickname: 'มาลี', primaryTeamId: WT.id,  isActive: true } }),
    prisma.employee.upsert({ where: { id: 5 }, update: {}, create: { id: 5, fullName: 'วิโรจน์ ขยันดี', nickname: 'โรจน์',primaryTeamId: ST.id,  isActive: true } }),
  ])

  await Promise.all([
    prisma.site.upsert({ where: { code: 'SKK' }, update: {}, create: { code: 'SKK', name: 'สยามซิเมนต์ขอนแก่น', requiresAccess: [] } }),
    prisma.site.upsert({ where: { code: 'TCC' }, update: {}, create: { code: 'TCC', name: 'TCC สระบุรี',         requiresAccess: [] } }),
    prisma.site.upsert({ where: { code: 'QKW' }, update: {}, create: { code: 'QKW', name: 'ควอลิตี้ กาญจน์',    requiresAccess: [] } }),
    prisma.site.upsert({ where: { code: 'NSS' }, update: {}, create: { code: 'NSS', name: 'NS-SUS สระบุรี',      requiresAccess: ['NS-SUS'] } }),
  ])

  await prisma.employeeSiteAccess.upsert({
    where:  { employeeId_siteCode: { employeeId: 1, siteCode: 'NS-SUS' } },
    update: {},
    create: { employeeId: 1, siteCode: 'NS-SUS', expiryDate: new Date('2026-06-16') },
  })

  console.log('✅ Seed complete')
}

main().catch(console.error).finally(() => prisma.$disconnect())

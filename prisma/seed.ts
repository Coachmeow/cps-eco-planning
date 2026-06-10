import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('🗑  Clearing existing data...')
  await prisma.equipmentAssignment.deleteMany()
  await prisma.staffAssignment.deleteMany()
  await prisma.employeeSiteAccess.deleteMany()
  await prisma.equipment.deleteMany()
  await prisma.employee.deleteMany()
  await prisma.site.deleteMany()
  await prisma.equipmentType.deleteMany()
  await prisma.serviceTeam.deleteMany()

  // ── 1. Service Teams ─────────────────────────────────────────────────────
  console.log('🌱 Teams...')
  const [ST, AMB, WP, CEMS, WT, LOG] = await Promise.all([
    prisma.serviceTeam.create({ data: { code: 'ST',   name: 'Stack'     } }),
    prisma.serviceTeam.create({ data: { code: 'AMB',  name: 'Ambient'   } }),
    prisma.serviceTeam.create({ data: { code: 'WP',   name: 'Workplace' } }),
    prisma.serviceTeam.create({ data: { code: 'CEMS', name: 'CEMS'      } }),
    prisma.serviceTeam.create({ data: { code: 'WT',   name: 'Water'     } }),
    prisma.serviceTeam.create({ data: { code: 'LOG',  name: 'Logistic'  } }),
  ])

  // ── 2. Equipment Types ────────────────────────────────────────────────────
  console.log('🌱 Equipment types...')
  const [TSP, PM10, PM25, SO2, NO2, WSWD, CO, H2S, BOX, DIOXIN, OPACITY,
         SKC, GILIAN, CYCLONE, DOSE, SOUND, LUX, HEAT, COPS, VOCS, VIBRATION] =
    await Promise.all([
      prisma.equipmentType.create({ data: { code: 'TSP',       name: 'TSP Sampler',          primaryTeamId: ST.id  } }),
      prisma.equipmentType.create({ data: { code: 'PM10',      name: 'PM10 Sampler',         primaryTeamId: AMB.id } }),
      prisma.equipmentType.create({ data: { code: 'PM25',      name: 'PM2.5 Sampler',        primaryTeamId: AMB.id } }),
      prisma.equipmentType.create({ data: { code: 'SO2',       name: 'SO2 Analyzer',         primaryTeamId: ST.id  } }),
      prisma.equipmentType.create({ data: { code: 'NO2',       name: 'NO2 Analyzer',         primaryTeamId: ST.id  } }),
      prisma.equipmentType.create({ data: { code: 'WSWD',      name: 'Wind Speed/Direction', primaryTeamId: AMB.id } }),
      prisma.equipmentType.create({ data: { code: 'CO',        name: 'CO Analyzer',          primaryTeamId: ST.id  } }),
      prisma.equipmentType.create({ data: { code: 'H2S',       name: 'H2S Monitor',          primaryTeamId: ST.id  } }),
      prisma.equipmentType.create({ data: { code: 'BOX',       name: 'Sampling Box (ตู้)',   primaryTeamId: ST.id  } }),
      prisma.equipmentType.create({ data: { code: 'DIOXIN',    name: 'Dioxin Sampler',       primaryTeamId: ST.id  } }),
      prisma.equipmentType.create({ data: { code: 'OPACITY',   name: 'Opacity Meter',        primaryTeamId: ST.id  } }),
      prisma.equipmentType.create({ data: { code: 'SKC',       name: 'SKC Pump',             primaryTeamId: WP.id  } }),
      prisma.equipmentType.create({ data: { code: 'GILIAN',    name: 'Gilian Pump',          primaryTeamId: WP.id  } }),
      prisma.equipmentType.create({ data: { code: 'CYCLONE',   name: 'Cyclone',              primaryTeamId: WP.id  } }),
      prisma.equipmentType.create({ data: { code: 'DOSE',      name: 'Noise Dosimeter',      primaryTeamId: WP.id  } }),
      prisma.equipmentType.create({ data: { code: 'SOUND',     name: 'Sound Level Meter',    primaryTeamId: WP.id  } }),
      prisma.equipmentType.create({ data: { code: 'LUX',       name: 'Lux Meter',            primaryTeamId: WP.id  } }),
      prisma.equipmentType.create({ data: { code: 'HEAT',      name: 'Heat Stress Meter',    primaryTeamId: WP.id  } }),
      prisma.equipmentType.create({ data: { code: 'COPS',      name: 'CO Personal Sampler',  primaryTeamId: WP.id  } }),
      prisma.equipmentType.create({ data: { code: 'VOCS',      name: 'VOCs Sampler',         primaryTeamId: WP.id  } }),
      prisma.equipmentType.create({ data: { code: 'VIBRATION', name: 'Vibration Meter',      primaryTeamId: WP.id  } }),
    ])

  // ── 3. Equipment Items ────────────────────────────────────────────────────
  console.log('🌱 Equipment items...')
  type EqRow = { typeId: number; internalNo: string; serialNo?: string; isRental?: boolean; rentalVendor?: string }
  const e = (typeId: number, internalNo: string, opts: Omit<EqRow, 'typeId'|'internalNo'> = {}): EqRow =>
    ({ typeId, internalNo, ...opts })

  await prisma.equipment.createMany({ data: [
    // ── TSP ──
    e(TSP.id, 'TSP SP49',        { serialNo: 'SP49'  }),
    e(TSP.id, 'TSP SP50',        { serialNo: 'SP50'  }),
    e(TSP.id, 'TSP SP154',       { serialNo: 'SP154' }),
    e(TSP.id, 'TSP SP157',       { serialNo: 'SP157' }),
    e(TSP.id, 'TSP SP337',       { serialNo: 'SP337' }),
    e(TSP.id, 'TSP SP338',       { serialNo: 'SP338' }),
    e(TSP.id, 'TSP SP340',       { serialNo: 'SP340' }),
    e(TSP.id, 'TSP SP341',       { serialNo: 'SP341' }),
    e(TSP.id, 'TSP SP429',       { serialNo: 'SP429' }),
    e(TSP.id, 'TSP SP430',       { serialNo: 'SP430' }),
    e(TSP.id, 'TSP SP431',       { serialNo: 'SP431' }),
    e(TSP.id, 'TSP SP432',       { serialNo: 'SP432' }),
    e(TSP.id, 'TSP SP433',       { serialNo: 'SP433' }),
    e(TSP.id, 'TSP SP434',       { serialNo: 'SP434' }),
    e(TSP.id, 'TSP No.25'),
    e(TSP.id, 'TSP No.26'),
    e(TSP.id, 'TSP No.27'),
    e(TSP.id, 'TSP เช่า No.1',   { isRental: true }),
    e(TSP.id, 'TSP เช่า No.2',   { isRental: true }),
    e(TSP.id, 'TSP เช่า No.3',   { isRental: true }),
    e(TSP.id, 'TSP เช่า No.4',   { isRental: true }),
    e(TSP.id, 'TSP เช่า No.5',   { isRental: true }),
    e(TSP.id, 'TSP เช่า No.6',   { isRental: true }),
    e(TSP.id, 'TSP เช่า No.7',   { isRental: true }),
    e(TSP.id, 'TSP เช่า No.8',   { isRental: true }),

    // ── PM10 ──
    e(PM10.id, 'PM10 SP332',      { serialNo: 'SP332' }),
    e(PM10.id, 'PM10 SP333',      { serialNo: 'SP333' }),
    e(PM10.id, 'PM10 SP334',      { serialNo: 'SP334' }),
    e(PM10.id, 'PM10 SP335',      { serialNo: 'SP335' }),
    e(PM10.id, 'PM10 SP435',      { serialNo: 'SP435' }),
    e(PM10.id, 'PM10 SP436',      { serialNo: 'SP436' }),
    e(PM10.id, 'PM10 SP437',      { serialNo: 'SP437' }),
    e(PM10.id, 'PM10 SP438',      { serialNo: 'SP438' }),
    e(PM10.id, 'PM10 SP439',      { serialNo: 'SP439' }),
    e(PM10.id, 'PM10 SP440',      { serialNo: 'SP440' }),
    e(PM10.id, 'PM10 SP441',      { serialNo: 'SP441' }),
    e(PM10.id, 'PM10 SP442',      { serialNo: 'SP442' }),
    e(PM10.id, 'PM10 SP443',      { serialNo: 'SP443' }),
    e(PM10.id, 'PM10 SP57',       { serialNo: 'SP57'  }),
    e(PM10.id, 'PM10 SP148',      { serialNo: 'SP148' }),
    e(PM10.id, 'PM10 No.23'),
    e(PM10.id, 'PM10 No.24'),
    e(PM10.id, 'PM10 No.25'),
    e(PM10.id, 'PM10 เช่า No.1',  { isRental: true }),
    e(PM10.id, 'PM10 เช่า No.2',  { isRental: true }),
    e(PM10.id, 'PM10 เช่า No.3',  { isRental: true }),
    e(PM10.id, 'PM10 เช่า No.4',  { isRental: true }),
    e(PM10.id, 'PM10 เช่า No.5',  { isRental: true }),
    e(PM10.id, 'PM10 เช่า No.6',  { isRental: true }),

    // ── PM2.5 ──
    e(PM25.id, 'PM2.5 SP643',     { serialNo: 'SP643' }),
    e(PM25.id, 'PM2.5 SP644',     { serialNo: 'SP644' }),
    e(PM25.id, 'PM2.5 SP645',     { serialNo: 'SP645' }),
    e(PM25.id, 'PM2.5 SP670',     { serialNo: 'SP670' }),
    e(PM25.id, 'PM2.5 SP671',     { serialNo: 'SP671' }),
    e(PM25.id, 'PM2.5 SP672',     { serialNo: 'SP672' }),
    e(PM25.id, 'PM2.5 SP673',     { serialNo: 'SP673' }),
    e(PM25.id, 'PM2.5 SP642',     { serialNo: 'SP642' }),
    e(PM25.id, 'PM2.5 No.1'),
    e(PM25.id, 'PM2.5 No.6'),
    e(PM25.id, 'PM2.5 No.7'),
    e(PM25.id, 'PM2.5 No.8'),

    // ── SO2 ──
    e(SO2.id,  'SO2 A-No.9',      { serialNo: '839'  }),
    e(SO2.id,  'SO2 A-No.10',     { serialNo: '837'  }),
    e(SO2.id,  'SO2 A-No.12',     { serialNo: '5552' }),
    e(SO2.id,  'SO2 A-No.13',     { serialNo: '5553' }),
    e(SO2.id,  'SO2 A-No.14',     { serialNo: '5554' }),
    e(SO2.id,  'SO2 A-6707',      { serialNo: '6707' }),
    e(SO2.id,  'SO2 A-6708',      { serialNo: '6708' }),
    e(SO2.id,  'SO2 E-SP461',     { serialNo: 'SP461' }),
    e(SO2.id,  'SO2 E-SP462',     { serialNo: 'SP462' }),
    e(SO2.id,  'SO2 E-SP463',     { serialNo: 'SP463' }),
    e(SO2.id,  'SO2 E-SP464',     { serialNo: 'SP464' }),
    e(SO2.id,  'SO2 E-SP465',     { serialNo: 'SP465' }),
    e(SO2.id,  'SO2 E-SP466',     { serialNo: 'SP466' }),

    // ── NO2 ──
    e(NO2.id,  'NO2 A-No.09',     { serialNo: '951' }),
    e(NO2.id,  'NO2 A-No.10'),
    e(NO2.id,  'NO2 A-No.11'),
    e(NO2.id,  'NO2 A-No.12'),
    e(NO2.id,  'NO2 A-No.13'),
    e(NO2.id,  'NO2 A-No.14'),
    e(NO2.id,  'NO2 A-No.15'),
    e(NO2.id,  'NO2 A-No.16'),
    e(NO2.id,  'NO2 E-SP472',     { serialNo: 'SP472' }),
    e(NO2.id,  'NO2 E-SP473',     { serialNo: 'SP473' }),
    e(NO2.id,  'NO2 E-SP474',     { serialNo: 'SP474' }),
    e(NO2.id,  'NO2 E-SP475',     { serialNo: 'SP475' }),
    e(NO2.id,  'NO2 E-SP476',     { serialNo: 'SP476' }),
    e(NO2.id,  'NO2 E-SP477',     { serialNo: 'SP477' }),
    e(NO2.id,  'NO2 E-SP478',     { serialNo: 'SP478' }),
    e(NO2.id,  'NO2 เช่า No.1',   { isRental: true }),
    e(NO2.id,  'NO2 เช่า No.2',   { isRental: true }),

    // ── WS-WD ──
    e(WSWD.id, 'WS-WD SP330',     { serialNo: 'SP330' }),
    e(WSWD.id, 'WS-WD SP331',     { serialNo: 'SP331' }),
    e(WSWD.id, 'WS-WD SP397',     { serialNo: 'SP397' }),
    e(WSWD.id, 'WS-WD SP401',     { serialNo: 'SP401' }),
    e(WSWD.id, 'WS-WD SP405',     { serialNo: 'SP405' }),
    e(WSWD.id, 'WS-WD SP407',     { serialNo: 'SP407' }),
    e(WSWD.id, 'WS-WD SP409',     { serialNo: 'SP409' }),
    e(WSWD.id, 'WS-WD SP665',     { serialNo: 'SP665' }),
    e(WSWD.id, 'WS-WD SP666',     { serialNo: 'SP666' }),
    e(WSWD.id, 'WS-WD SP667',     { serialNo: 'SP667' }),
    e(WSWD.id, 'WS-WD SP668',     { serialNo: 'SP668' }),
    e(WSWD.id, 'WS-WD SP669',     { serialNo: 'SP669' }),
    e(WSWD.id, 'WS-WD SP714',     { serialNo: 'SP714' }),
    e(WSWD.id, 'WS-WD SP715',     { serialNo: 'SP715' }),
    e(WSWD.id, 'WS-WD SP716',     { serialNo: 'SP716' }),
    e(WSWD.id, 'WS-WD SP717',     { serialNo: 'SP717' }),
    e(WSWD.id, 'WS-WD SP718',     { serialNo: 'SP718' }),
    e(WSWD.id, 'WS-WD SP810',     { serialNo: 'SP810' }),
    e(WSWD.id, 'WS-WD SP811',     { serialNo: 'SP811' }),
    e(WSWD.id, 'WS-WD SP812',     { serialNo: 'SP812' }),
    e(WSWD.id, 'WS-WD SP826',     { serialNo: 'SP826' }),
    e(WSWD.id, 'WS-WD SP827',     { serialNo: 'SP827' }),
    e(WSWD.id, 'WS-WD SP828',     { serialNo: 'SP828' }),
    e(WSWD.id, 'WS-WD SP829',     { serialNo: 'SP829' }),
    e(WSWD.id, 'WS-WD เช่า No.1', { isRental: true }),
    e(WSWD.id, 'WS-WD เช่า No.2', { isRental: true }),
    e(WSWD.id, 'WS-WD เช่า No.3', { isRental: true }),
    e(WSWD.id, 'WS-WD เช่า No.4', { isRental: true }),
    e(WSWD.id, 'WS-WD เช่า No.5', { isRental: true }),

    // ── CO (rental only) ──
    e(CO.id,   'CO เช่า No.1',    { isRental: true }),
    e(CO.id,   'CO เช่า No.2',    { isRental: true }),
    e(CO.id,   'CO เช่า No.3',    { isRental: true }),
    e(CO.id,   'CO เช่า No.4',    { isRental: true }),

    // ── H2S ──
    e(H2S.id,  'H2S No.1'),
    e(H2S.id,  'H2S No.2'),
    e(H2S.id,  'H2S No.3'),
    e(H2S.id,  'H2S No.4'),

    // ── Sampling Box (ตู้) ──
    e(BOX.id,  'ตู้ No.1(S)'),
    e(BOX.id,  'ตู้ No.2(S)'),
    e(BOX.id,  'ตู้ No.3(S)'),
    e(BOX.id,  'ตู้ No.4(S)'),
    e(BOX.id,  'ตู้ No.5(S)'),
    e(BOX.id,  'ตู้ No.12(S)'),
    e(BOX.id,  'ตู้ No.6(S)(เล็ก)'),
    e(BOX.id,  'ตู้ No.7(S)(เล็ก)'),
    e(BOX.id,  'ตู้ No.8(S)(เล็ก)'),
    e(BOX.id,  'ตู้ No.9(S)(เล็ก)'),
    e(BOX.id,  'ตู้ No.10(S)(เล็ก)'),
    e(BOX.id,  'ตู้ No.11(S)(เล็ก)'),

    // ── Dioxin ──
    e(DIOXIN.id, 'Dioxin No.1'),
    e(DIOXIN.id, 'Dioxin No.2'),
    e(DIOXIN.id, 'Dioxin No.3'),
    e(DIOXIN.id, 'Dioxin No.4'),

    // ── Opacity ──
    e(OPACITY.id, 'Opacity No.1'),

    // ── SKC Pump ──
    e(SKC.id,  'SKC SP511',       { serialNo: 'SP511' }),
    e(SKC.id,  'SKC SP512',       { serialNo: 'SP512' }),
    e(SKC.id,  'SKC SP520',       { serialNo: 'SP520' }),
    e(SKC.id,  'SKC SP521',       { serialNo: 'SP521' }),
    e(SKC.id,  'SKC SP524',       { serialNo: 'SP524' }),
    e(SKC.id,  'SKC SP525',       { serialNo: 'SP525' }),
    e(SKC.id,  'SKC SP526',       { serialNo: 'SP526' }),
    e(SKC.id,  'SKC SP528',       { serialNo: 'SP528' }),
    e(SKC.id,  'SKC SP529',       { serialNo: 'SP529' }),
    e(SKC.id,  'SKC SP712',       { serialNo: 'SP712' }),

    // ── Cyclone (representative) ──
    ...Array.from({ length: 24 }, (_, i) => e(CYCLONE.id, `Cyclone No.${i + 1}`)),
    ...Array.from({ length: 11 }, (_, i) => e(CYCLONE.id, `Cyclone Ny(nylon) No.${i + 1}`)),

    // ── Noise Dosimeter ──
    ...Array.from({ length: 8 }, (_, i) => e(DOSE.id, `Dose 3M No.${i + 1}`)),
    ...Array.from({ length: 8 }, (_, i) => e(DOSE.id, `Dose SVANTEX No.${i + 1}`)),
    e(DOSE.id, 'Dose casella No.1'),
    e(DOSE.id, 'Dose casella No.2'),
    e(DOSE.id, 'Dose casella No.3'),
    e(DOSE.id, 'Dose 3M(B) No.1'),
    e(DOSE.id, 'Dose 3M(B) No.2'),
    e(DOSE.id, 'Dose 3M(B) No.3'),
    e(DOSE.id, 'Dose SVANTEX(B) No.1'),
    e(DOSE.id, 'Dose SVANTEX(B) No.2'),

    // ── Sound Level Meter ──
    e(SOUND.id, 'Sound casella No.1'),
    e(SOUND.id, 'Sound casella No.2'),
    e(SOUND.id, 'Sound casella No.3'),
    e(SOUND.id, 'Sound NL42(RION) No.1'),
    e(SOUND.id, 'Sound NL42(RION) No.2'),
    e(SOUND.id, 'Sound NL42(RION) No.3'),
    e(SOUND.id, 'Sound NL42(RION) No.4'),
    e(SOUND.id, 'Sound NL52(RION) No.1'),
    e(SOUND.id, 'Sound NL52(RION) No.2'),
    e(SOUND.id, 'Sound NL52(RION) No.3'),
    e(SOUND.id, 'Sound NL52(RION) No.4'),
    e(SOUND.id, 'Sound NL52(RION) No.5'),
    e(SOUND.id, 'Sound NL52(RION) No.6'),
    e(SOUND.id, 'Sound NL52(RION) No.7'),
    e(SOUND.id, 'Sound NL53(RION) No.1'),
    e(SOUND.id, 'Sound NL53(RION) No.2'),
    e(SOUND.id, 'Sound NL53(RION) No.3'),
    e(SOUND.id, 'Sound NL53(RION) No.4'),
    e(SOUND.id, 'Sound NL53(RION) No.5'),
    e(SOUND.id, 'Sound NL53(RION) No.6'),
    e(SOUND.id, 'Sound NL53(RION) No.7'),

    // ── Lux Meter ──
    e(LUX.id,  'Lux SP167',       { serialNo: 'SP167' }),
    e(LUX.id,  'Lux SP374',       { serialNo: 'SP374' }),
    e(LUX.id,  'Lux SP375',       { serialNo: 'SP375' }),
    e(LUX.id,  'Lux SP770',       { serialNo: 'SP770' }),
    e(LUX.id,  'Lux SP787',       { serialNo: 'SP787' }),
    e(LUX.id,  'Lux SP807',       { serialNo: 'SP807' }),
    e(LUX.id,  'Lux SP808',       { serialNo: 'SP808' }),
    e(LUX.id,  'Lux SP809',       { serialNo: 'SP809' }),

    // ── Heat Stress Meter ──
    e(HEAT.id, 'Heat SP269',      { serialNo: 'SP269' }),
    e(HEAT.id, 'Heat SP270',      { serialNo: 'SP270' }),
    e(HEAT.id, 'Heat SP316',      { serialNo: 'SP316' }),
    e(HEAT.id, 'Heat SP317',      { serialNo: 'SP317' }),
    e(HEAT.id, 'Heat SP319',      { serialNo: 'SP319' }),
    e(HEAT.id, 'Heat SP418',      { serialNo: 'SP418' }),
    e(HEAT.id, 'Heat SP419',      { serialNo: 'SP419' }),
    e(HEAT.id, 'Heat SP420',      { serialNo: 'SP420' }),
    e(HEAT.id, 'Heat SP421',      { serialNo: 'SP421' }),
    e(HEAT.id, 'Heat SP422',      { serialNo: 'SP422' }),
    e(HEAT.id, 'Heat SP423',      { serialNo: 'SP423' }),
    e(HEAT.id, 'Heat SP424',      { serialNo: 'SP424' }),
    e(HEAT.id, 'Heat SP708',      { serialNo: 'SP708' }),
    e(HEAT.id, 'Heat SP790',      { serialNo: 'SP790' }),
    e(HEAT.id, 'Heat SP791',      { serialNo: 'SP791' }),

    // ── CO Personal Sampler ──
    e(COPS.id, 'CO-PS SP709',     { serialNo: 'SP709' }),
    e(COPS.id, 'CO-PS SP710',     { serialNo: 'SP710' }),
    e(COPS.id, 'CO-PS SP713',     { serialNo: 'SP713' }),
    e(COPS.id, 'CO-PS SP755',     { serialNo: 'SP755' }),

    // ── VOCs Sampler ──
    ...Array.from({ length: 7 }, (_, i) => e(VOCS.id, `VOCs No.${i + 1}`)),

    // ── Vibration Meter ──
    e(VIBRATION.id, 'Vibration SP410', { serialNo: 'SP410' }),
    e(VIBRATION.id, 'Vibration SP542', { serialNo: 'SP542' }),
  ] })

  // ── 4. Employees (41 คน จาก Sheet1 แผนงานฯ 2569) ─────────────────────────
  console.log('🌱 Employees...')
  await prisma.employee.createMany({ data: [
    // ST (13 คน)
    { fullName: 'นายแก้วกนก พูนชัย',          nickname: 'แก้วกนก',    primaryTeamId: ST.id   },
    { fullName: 'นายอนิรุต กองมะณี',            nickname: 'อนิรุต',      primaryTeamId: ST.id   },
    { fullName: 'นายสมพงษ์ สุวรรณทอง',         nickname: 'สมพงษ์',     primaryTeamId: ST.id   },
    { fullName: 'นายสุรศักดิ์ การบรรจง',       nickname: 'สุรศักดิ์',   primaryTeamId: ST.id   },
    { fullName: 'นายกิจธนันท์ภณ เสถบุตร',      nickname: 'กิจ',          primaryTeamId: ST.id   },
    { fullName: 'นายนาวิน คงบุญวาส',           nickname: 'นาวิน',       primaryTeamId: ST.id   },
    { fullName: 'นายมนตรี ไชยเมือง',            nickname: 'มนตรี',       primaryTeamId: ST.id   },
    { fullName: 'นายนิรันดร์ วงศ์แสงจันทร์',   nickname: 'นิรันดร์',    primaryTeamId: ST.id   },
    { fullName: 'นายจิรายุ ยาบ้านทุ่ม',        nickname: 'จิรายุ',      primaryTeamId: ST.id   },
    { fullName: 'นายธวัชชัย ทองตัน',           nickname: 'ธวัชชัย',     primaryTeamId: ST.id   },
    { fullName: 'นายนิพล เบ้าคำ',              nickname: 'นิพล',        primaryTeamId: ST.id   },
    { fullName: 'นายวันชัย เผ่าสิน',            nickname: 'วันชัย',      primaryTeamId: ST.id   },
    // AMB (9 คน)
    { fullName: 'นายนัฐพงษ์ ใจดี',             nickname: 'นัฐพงษ์',     primaryTeamId: AMB.id  },
    { fullName: 'นายประวิช โฉมหาญ',             nickname: 'ประวิช',      primaryTeamId: AMB.id  },
    { fullName: 'นายธนสินทร์ องอาจ',           nickname: 'ธนสินทร์',    primaryTeamId: AMB.id  },
    { fullName: 'นายสุทัศน์ กองกี',             nickname: 'สุทัศน์',     primaryTeamId: AMB.id  },
    { fullName: 'นายอนุเชฐ ชมแพ',              nickname: 'อนุเชฐ',      primaryTeamId: AMB.id  },
    { fullName: 'นายณัฐวุฒิ วรวุฒิ',            nickname: 'ณัฐวุฒิ ว.',  primaryTeamId: AMB.id  },
    { fullName: 'นายธนพล สุวรรณโสภา',          nickname: 'ธนพล ส.',     primaryTeamId: AMB.id  },
    { fullName: 'นายอธิคม ขวัญเมือง',           nickname: 'อธิคม',       primaryTeamId: AMB.id  },
    { fullName: 'นายไพบูรณ์ เพ็ชรจรูญ',        nickname: 'ไพบูรณ์',     primaryTeamId: AMB.id  },
    // WP (7 คน)
    { fullName: 'นายฐิติพงศ์ นาคสกุล',         nickname: 'ฐิติพงศ์',    primaryTeamId: WP.id   },
    { fullName: 'นายธนพล รัตนอนันท์',           nickname: 'ธนพล ร.',     primaryTeamId: WP.id   },
    { fullName: 'นายอมรเทพ ประทุมถิ่น',        nickname: 'อมรเทพ',      primaryTeamId: WP.id   },
    { fullName: 'นายนพดล สีหานาม',             nickname: 'นพดล',        primaryTeamId: WP.id   },
    { fullName: 'นายกฤษณพล เกิดศิลป์',        nickname: 'กฤษณพล',     primaryTeamId: WP.id   },
    { fullName: 'นายศุภณัฏฐ์ ปิยะนภสินธุ์',     nickname: 'ศุภณัฏฐ์',    primaryTeamId: WP.id   },
    { fullName: 'นายณรงค์ฤทธิ์ กระพี้นอก',     nickname: 'ณรงค์ฤทธิ์',  primaryTeamId: WP.id   },
    // WT (5 คน, WW ในไฟล์ Excel)
    { fullName: 'นายมโนรมย์ สมรูป',            nickname: 'มโนรมย์',     primaryTeamId: WT.id   },
    { fullName: 'นายณัฐวุฒิ ดีวงษ์',           nickname: 'ณัฐวุฒิ ด.',  primaryTeamId: WT.id   },
    { fullName: 'นายอนพัช ตาบดี',              nickname: 'อนพัช',       primaryTeamId: WT.id   },
    { fullName: 'นายวุฒิศักดิ์ ฮงทอง',         nickname: 'วุฒิศักดิ์',   primaryTeamId: WT.id   },
    { fullName: 'นางสาววรารัตน์ พละศักดิ์',    nickname: 'วรารัตน์',    primaryTeamId: WT.id   },
    // CEMS (4 คน)
    { fullName: 'นายปราโมทย์ สาสูงเนิน',      nickname: 'ปราโมทย์',    primaryTeamId: CEMS.id },
    { fullName: 'นายวรเมธ สีกุหลาบ',           nickname: 'วรเมธ',       primaryTeamId: CEMS.id },
    { fullName: 'นายกฤตภพ บรรลือสระน้อย',     nickname: 'กฤตภพ',      primaryTeamId: CEMS.id },
    { fullName: 'นายฤทธิชัย เครื่องเทศ',      nickname: 'ฤทธิชัย',     primaryTeamId: CEMS.id },
    // LOG / Mt&Sp (4 คน)
    { fullName: 'นางสาวฉัตรฑริกา วรรณประภา',   nickname: 'ฉัตรฑริกา',  primaryTeamId: LOG.id  },
    { fullName: 'นางสาววิภารัตน์ เข็มทอง',     nickname: 'วิภารัตน์',   primaryTeamId: LOG.id  },
    { fullName: 'นายดนุชิต เกวียนสูงเนิน',     nickname: 'ดนุชิต',      primaryTeamId: LOG.id  },
    { fullName: 'นางสาวศศิยาพัชร์ ไตรยสุทธิ์', nickname: 'ศศิยาพัชร์', primaryTeamId: LOG.id  },
  ] })

  // ── 5. Sites ──────────────────────────────────────────────────────────────
  console.log('🌱 Sites...')
  await prisma.site.createMany({ data: [
    { code: 'NS-SUS',  name: 'นิวซัสเทนนาบิลิตี้',           color: 'violet', requiresAccess: ['NS-SUS']  },
    { code: 'SCGP',    name: 'SCGP',                            color: 'sky',    requiresAccess: ['SCGP']    },
    { code: 'PHOENIX', name: 'ฟินิคซ พัลพ์ แอนด์ เปเปอร์',   color: 'rose',   requiresAccess: ['PHOENIX'] },
  ] })

  // ── 6. Employee Site Access (จาก Sheet1 คอลัมน์ access expiry) ───────────
  console.log('🌱 Access expiry...')
  const emps = await prisma.employee.findMany({ orderBy: { id: 'asc' } })

  // helper: หา id ของพนักงานตาม index ที่ insert ไป (0-based)
  const empId = (idx: number) => emps[idx].id

  await prisma.employeeSiteAccess.createMany({ data: [
    // ── NS-SUS ──
    { employeeId: empId(0),  siteCode: 'NS-SUS', expiryDate: new Date('2026-05-25') }, // แก้วกนก
    { employeeId: empId(1),  siteCode: 'NS-SUS', expiryDate: new Date('2026-05-25') }, // อนิรุต
    { employeeId: empId(2),  siteCode: 'NS-SUS', expiryDate: new Date('2026-05-25') }, // สมพงษ์
    { employeeId: empId(3),  siteCode: 'NS-SUS', expiryDate: new Date('2026-05-25') }, // สุรศักดิ์
    { employeeId: empId(4),  siteCode: 'NS-SUS', expiryDate: new Date('2026-05-25') }, // กิจธนันท์ภณ
    { employeeId: empId(5),  siteCode: 'NS-SUS', expiryDate: new Date('2026-11-30') }, // นาวิน (30/11)
    { employeeId: empId(6),  siteCode: 'NS-SUS', expiryDate: new Date('2026-05-25') }, // มนตรี
    { employeeId: empId(7),  siteCode: 'NS-SUS', expiryDate: new Date('2026-05-25') }, // นิรันดร์
    { employeeId: empId(8),  siteCode: 'NS-SUS', expiryDate: new Date('2026-05-25') }, // จิรายุ
    { employeeId: empId(10), siteCode: 'NS-SUS', expiryDate: new Date('2026-05-25') }, // นิพล
    // ── SCGP ──
    { employeeId: empId(0),  siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // แก้วกนก
    { employeeId: empId(1),  siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // อนิรุต
    { employeeId: empId(2),  siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // สมพงษ์
    { employeeId: empId(3),  siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // สุรศักดิ์
    { employeeId: empId(4),  siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // กิจธนันท์ภณ
    { employeeId: empId(5),  siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // นาวิน
    { employeeId: empId(6),  siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // มนตรี
    { employeeId: empId(7),  siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // นิรันดร์
    { employeeId: empId(8),  siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // จิรายุ
    { employeeId: empId(9),  siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // ธวัชชัย
    { employeeId: empId(10), siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // นิพล
    { employeeId: empId(11), siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // วันชัย
    { employeeId: empId(21), siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // ฐิติพงศ์ (WP)
    { employeeId: empId(22), siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // ธนพล ร.
    { employeeId: empId(26), siteCode: 'SCGP', expiryDate: new Date('2026-12-31') }, // ศุภณัฏฐ์
    // ── PHOENIX (ฟินิคซ) ──
    { employeeId: empId(21), siteCode: 'PHOENIX', expiryDate: new Date('2026-05-08') }, // ฐิติพงศ์
    { employeeId: empId(22), siteCode: 'PHOENIX', expiryDate: new Date('2027-04-06') }, // ธนพล ร.
    { employeeId: empId(26), siteCode: 'PHOENIX', expiryDate: new Date('2027-02-07') }, // ศุภณัฏฐ์
  ] })

  const empCount = await prisma.employee.count()
  const eqCount  = await prisma.equipment.count()
  console.log(`\n✅ Seed complete`)
  console.log(`   👤 ${empCount} employees`)
  console.log(`   🔧 ${eqCount} equipment items (21 types)`)
  console.log(`   🏭 3 sites with access expiry records`)
}

main().catch(console.error).finally(() => prisma.$disconnect())

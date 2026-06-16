import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get('all') === 'true'
  const vehicles = await prisma.vehicle.findMany({
    where:   all ? {} : { status: { not: 'RETIRED' } },
    orderBy: [{ status: 'asc' }, { licensePlate: 'asc' }],
  })
  // strip base64 photoUrl ออกจาก list (โหลดผ่าน /photo) ส่งแค่ hasPhoto
  const out = vehicles.map(({ photoUrl, ...v }) => ({ ...v, hasPhoto: !!photoUrl }))
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const body = await req.json()
    if (!body.licensePlate) return NextResponse.json({ error: 'กรอกทะเบียนรถ' }, { status: 400 })
    const vehicle = await prisma.vehicle.create({
      data: {
        licensePlate: body.licensePlate,
        name:         body.name        || null,
        vehicleType:  body.vehicleType || null,
        brand:        body.brand       || null,
        model:        body.model       || null,
        seats:        body.seats != null && body.seats !== '' ? parseInt(body.seats) : null,
        photoUrl:     body.photoUrl    || null,
        status:       body.status      ?? 'ACTIVE',
        notes:        body.notes       || null,
      },
    })
    return NextResponse.json(vehicle, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

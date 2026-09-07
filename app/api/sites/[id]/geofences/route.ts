import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

// กรอบ Geofence ของไซต์ (วาดเองบนแผนที่) — GET รายการ / POST แทนที่ทั้งชุด
// เก็บแบบ "แทนที่ทั้งชุด" เพื่อให้ UI วาด/แก้/ลบแล้วบันทึกครั้งเดียวง่าย ๆ

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const siteId = parseInt(id)
  if (!siteId) return NextResponse.json({ error: 'siteId ไม่ถูกต้อง' }, { status: 400 })
  const geofences = await prisma.siteGeofence.findMany({
    where: { siteId },
    orderBy: { id: 'asc' },
  })
  return NextResponse.json(geofences)
}

interface GeofenceInput {
  kind: 'CIRCLE' | 'POLYGON'
  label?: string | null
  centerLat?: number | null
  centerLng?: number | null
  radiusM?: number | null
  points?: [number, number][] | null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const siteId = parseInt(id)
    if (!siteId) return NextResponse.json({ error: 'siteId ไม่ถูกต้อง' }, { status: 400 })

    const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } })
    if (!site) return NextResponse.json({ error: 'ไม่พบไซต์' }, { status: 404 })

    const body = await req.json()
    const raw: GeofenceInput[] = Array.isArray(body?.geofences) ? body.geofences : []

    // validate + normalize
    const data = raw
      .map((g) => {
        if (g.kind === 'CIRCLE') {
          if (typeof g.centerLat !== 'number' || typeof g.centerLng !== 'number' || !(Number(g.radiusM) > 0)) return null
          return {
            siteId, kind: 'CIRCLE' as const, label: g.label || null,
            centerLat: g.centerLat, centerLng: g.centerLng, radiusM: Number(g.radiusM),
            points: undefined,
          }
        }
        // POLYGON
        const pts = Array.isArray(g.points) ? g.points.filter(
          (p) => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number',
        ) : []
        if (pts.length < 3) return null
        return {
          siteId, kind: 'POLYGON' as const, label: g.label || null,
          centerLat: null, centerLng: null, radiusM: null,
          points: pts,
        }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)

    // แทนที่ทั้งชุดใน transaction เดียว
    await prisma.$transaction([
      prisma.siteGeofence.deleteMany({ where: { siteId } }),
      ...data.map((d) => prisma.siteGeofence.create({ data: d })),
    ])

    const geofences = await prisma.siteGeofence.findMany({ where: { siteId }, orderBy: { id: 'asc' } })
    return NextResponse.json({ ok: true, count: geofences.length, geofences })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

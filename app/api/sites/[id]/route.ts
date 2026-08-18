import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, getSession, hasRole, forbidden } from '@/lib/auth'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const body = await req.json()
    const site = await prisma.site.update({
      where: { id: parseInt(id) },
      data: {
        code:           body.code.toUpperCase().trim(),
        name:           body.name,
        clientName:     body.clientName   || null,
        province:       body.province     || null,
        region:         body.region       || null,
        color:          body.color        || 'emerald',
        requiresAccess: body.requiresAccess ?? [],
      },
    })
    return NextResponse.json(site)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!hasRole(session, 'ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const siteId = parseInt(id)
    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return NextResponse.json({ error: 'ไม่พบไซต์' }, { status: 404 })

    // ไซต์ถูกอ้างแบบ optional (siteId?) → ถ้าลบทั้งที่มีงาน งานเก่าจะกลายเป็นไม่มีไซต์เงียบๆ
    // จึง "บล็อก" ถ้ายังมีงาน/การจองผูกอยู่ (ต้องเป็นไซต์ที่ไม่มีงานเท่านั้น)
    const [staff, equip, veh, vLogs, vTrips] = await Promise.all([
      prisma.staffAssignment.count({ where: { siteId } }),
      prisma.equipmentAssignment.count({ where: { siteId } }),
      prisma.vehicleBooking.count({ where: { siteId } }),
      prisma.vehicleLog.count({ where: { siteId } }),
      prisma.vehicleTrip.count({ where: { siteId } }),
    ])
    const refs = staff + equip + veh + vLogs + vTrips
    if (refs > 0) {
      return NextResponse.json({ error: `ลบไม่ได้ — ไซต์นี้มีงาน/การจองผูกอยู่ ${refs} รายการ (ต้องเป็นไซต์ที่ไม่มีงาน)` }, { status: 400 })
    }

    let reason: string | null = null
    try { const b = await req.json(); reason = b?.reason ? String(b.reason) : null } catch { /* no body */ }
    const snapshot = JSON.parse(JSON.stringify({ site }))

    await prisma.$transaction(async (tx) => {
      await tx.deletionLog.create({
        data: {
          entityType: 'site', entityLabel: `${site.code} — ${site.name}`,
          reason, snapshot, deletedById: session!.uid, deletedByName: session!.name || session!.username || '—',
        },
      })
      await tx.site.delete({ where: { id: siteId } })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

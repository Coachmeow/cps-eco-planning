import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// รายการ siteId ที่มี geofence อย่างน้อย 1 กรอบ — ใช้ไฮไลต์ปุ่มในหน้าจัดการไซต์ (เบา ไม่แตะ /api/sites)
export async function GET() {
  const rows = await prisma.siteGeofence.findMany({ distinct: ['siteId'], select: { siteId: true } })
  return NextResponse.json(rows.map((r) => r.siteId))
}

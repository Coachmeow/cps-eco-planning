// จับคู่พิกัด GPS กับกรอบ Geofence ของไซต์ (วาดเองในระบบ)
//  - CIRCLE : ระยะจากจุดศูนย์กลาง (haversine) ≤ radiusM
//  - POLYGON: ray-casting (rectangle = polygon 4 จุด)
// ใช้ทั้งฝั่ง import GPS (จัดจุดจอด→ไซต์) และตรวจสอบตอนวาด

const R_EARTH_M = 6_371_000

// ระยะทางระหว่าง 2 พิกัด (เมตร)
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

export function pointInCircle(
  lat: number, lng: number,
  centerLat: number, centerLng: number, radiusM: number,
): boolean {
  return haversineM(lat, lng, centerLat, centerLng) <= radiusM
}

// ray-casting — points เป็น [lat, lng][] (วนปิดเองไม่จำเป็น)
export function pointInPolygon(lat: number, lng: number, points: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [yi, xi] = points[i]   // yi=lat, xi=lng
    const [yj, xj] = points[j]
    const intersect =
      (xi > lng) !== (xj > lng) &&
      lat < ((yj - yi) * (lng - xi)) / (xj - xi) + yi
    if (intersect) inside = !inside
  }
  return inside
}

// รูปแบบ geofence ที่ต้องใช้จับคู่ (พอสำหรับทั้ง CIRCLE/POLYGON + รู้ว่าเป็นของไซต์ไหน)
export interface GeofenceShape {
  siteId: number
  kind: 'CIRCLE' | 'POLYGON'
  centerLat: number | null
  centerLng: number | null
  radiusM: number | null
  points: unknown        // Json จาก DB — คาดว่าเป็น [lat,lng][]
}

function asPoints(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return []
  const out: [number, number][] = []
  for (const p of raw) {
    if (Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number') {
      out.push([p[0], p[1]])
    }
  }
  return out
}

export function inGeofence(lat: number, lng: number, g: GeofenceShape): boolean {
  if (g.kind === 'CIRCLE') {
    if (g.centerLat == null || g.centerLng == null || g.radiusM == null) return false
    return pointInCircle(lat, lng, g.centerLat, g.centerLng, g.radiusM)
  }
  const pts = asPoints(g.points)
  return pts.length >= 3 && pointInPolygon(lat, lng, pts)
}

// จับคู่พิกัดกับไซต์ — คืน siteId แรกที่ตกในกรอบ (null = ไม่อยู่ไซต์ใด)
// CIRCLE ที่เล็กกว่าจะถูกเลือกก่อนเมื่อทับกัน (เจาะจงกว่า) — เรียงตามรัศมีจากน้อยไปมาก
export function matchSite(lat: number, lng: number, geofences: GeofenceShape[]): number | null {
  const ordered = [...geofences].sort((a, b) => (a.radiusM ?? Infinity) - (b.radiusM ?? Infinity))
  for (const g of ordered) {
    if (inGeofence(lat, lng, g)) return g.siteId
  }
  return null
}

// คำนวณสรุป GPS ต่อคัน/ต่อวัน จาก ping — ระยะทาง, ทริป, จุดจอด→ไซต์, เส้นทาง downsample
import type { GpsPing } from './parseCartrack'
import { haversineM, matchSite, type GeofenceShape } from '@/lib/geofence'

// พารามิเตอร์การคำนวณ
const JITTER_M       = 15     // segment สั้นกว่านี้ = อยู่กับที่ (กัน GPS สั่น)
const GAP_CAP_S      = 300    // ถ้า ping ห่างเกินนี้ ไม่นับเวลา (ข้อมูลขาด)
const STOP_RADIUS_M  = 60     // รัศมี stay-point
const MIN_DWELL_MIN  = 5      // จอดอย่างน้อยกี่นาทีถึงนับเป็น "จุดจอด"
const PATH_STEP_S    = 30     // เก็บเส้นทาง 1 จุด/กี่วินาที

export interface GpsStop {
  lat: number
  lng: number
  arriveAt: Date
  departAt: Date
  dwellMin: number
  place: string
  siteId: number | null
}

export interface GpsDaySummary {
  distanceKm: number
  movingMin: number
  idleMin: number
  tripCount: number
  maxSpeed: number
  firstMoveAt: Date | null
  lastStopAt: Date | null
  driverName: string | null
  path: [number, number][]
  // ความเร็วรายเวลา: [วินาทีนับจากเที่ยงคืน, speed, roadSpeed, place] · place='' = ใช้ค่าก่อนหน้า
  speedSeries: SpeedPoint[]
  overspeedPts: number   // จำนวนจุดที่ speed > roadSpeed (roadSpeed>0)
  overspeedPct: number   // % จากจุดที่มี roadSpeed
  stops: GpsStop[]
}

export type SpeedPoint = [number, number, number, string]

const r5 = (n: number) => Math.round(n * 1e5) / 1e5

// stay-point detection: รวม ping ที่อยู่ใกล้กัน (≤ STOP_RADIUS) นานพอ = จุดจอด
function detectStops(pings: GpsPing[], geofences: GeofenceShape[]): GpsStop[] {
  const stops: GpsStop[] = []
  let i = 0
  while (i < pings.length) {
    const anchor = pings[i]
    let j = i + 1
    while (j < pings.length && haversineM(anchor.lat, anchor.lng, pings[j].lat, pings[j].lng) <= STOP_RADIUS_M) j++
    // ช่วง [i, j-1] อยู่ในรัศมีเดียวกัน
    const first = pings[i], last = pings[j - 1]
    const dwellMs = last.ts.getTime() - first.ts.getTime()
    const dwellMin = Math.round(dwellMs / 60000)
    if (dwellMin >= MIN_DWELL_MIN) {
      // centroid
      let sumLat = 0, sumLng = 0
      for (let k = i; k < j; k++) { sumLat += pings[k].lat; sumLng += pings[k].lng }
      const cLat = sumLat / (j - i), cLng = sumLng / (j - i)
      stops.push({
        lat: r5(cLat), lng: r5(cLng),
        arriveAt: first.ts, departAt: last.ts, dwellMin,
        place: (anchor.place || '').split(',').slice(0, 3).join(',').trim(),
        siteId: matchSite(cLat, cLng, geofences),
      })
      i = j
    } else {
      i = i + 1
    }
  }
  return stops
}

// pings ต้องเป็นของคัน+วันเดียวกัน (ยังไม่เรียงก็ได้)
export function processDay(rawPings: GpsPing[], geofences: GeofenceShape[]): GpsDaySummary {
  const pings = [...rawPings].sort((a, b) => a.ts.getTime() - b.ts.getTime())
  let distanceM = 0, movingSec = 0, idleSec = 0, maxSpeed = 0
  let firstMoveAt: Date | null = null, lastStopAt: Date | null = null
  let tripCount = 0
  let driverName: string | null = null
  const path: [number, number][] = []
  const speedSeries: SpeedPoint[] = []
  let lastPlace = ''
  let overspeedPts = 0, roadPts = 0
  let lastKept = -Infinity

  for (let k = 0; k < pings.length; k++) {
    const p = pings[k]
    if (p.speed > maxSpeed) maxSpeed = p.speed
    if (!driverName && p.driver) driverName = p.driver
    if (p.eventType === 'Ignition ON') tripCount++
    if (p.roadSpeed > 0) { roadPts++; if (p.speed > p.roadSpeed) overspeedPts++ }

    // เส้นทาง + ความเร็ว downsample (time-based, จุดเดียวกัน)
    const tSec = p.ts.getTime() / 1000
    if (tSec - lastKept >= PATH_STEP_S) {
      path.push([r5(p.lat), r5(p.lng)])
      const secOfDay = Math.round(((p.ts.getTime() / 1000) % 86400 + 86400) % 86400)
      const placeShort = (p.place || '').split(',').slice(0, 2).join(',').trim()
      const placeOut = placeShort && placeShort !== lastPlace ? placeShort : ''
      if (placeOut) lastPlace = placeShort
      speedSeries.push([secOfDay, Math.round(p.speed), Math.round(p.roadSpeed), placeOut])
      lastKept = tSec
    }

    if (k > 0) {
      const prev = pings[k - 1]
      const segM = haversineM(prev.lat, prev.lng, p.lat, p.lng)
      let dtS = (p.ts.getTime() - prev.ts.getTime()) / 1000
      if (dtS > GAP_CAP_S) dtS = 0   // ข้อมูลขาด — ไม่นับเวลา
      if (segM >= JITTER_M) {
        distanceM += segM
        movingSec += dtS
        if (!firstMoveAt) firstMoveAt = prev.ts
        lastStopAt = p.ts
      } else {
        idleSec += dtS
      }
    }
  }

  const stops = detectStops(pings, geofences)

  return {
    distanceKm: Math.round((distanceM / 1000) * 10) / 10,
    movingMin: Math.round(movingSec / 60),
    idleMin: Math.round(idleSec / 60),
    tripCount,
    maxSpeed: Math.round(maxSpeed),
    firstMoveAt, lastStopAt, driverName,
    path,
    speedSeries,
    overspeedPts,
    overspeedPct: roadPts > 0 ? Math.round((overspeedPts / roadPts) * 100) : 0,
    stops,
  }
}

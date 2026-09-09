'use client'

// แผนที่เส้นทาง GPS + จุดจอด + กรอบ geofence ของไซต์ (client-only, leaflet)
import { useEffect, useRef } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface GpsVisitPoint {
  siteId: number | null
  siteCode: string | null
  siteName: string | null
  rawPlace: string | null
  lat: number
  lng: number
  arriveAt: string
  departAt: string | null
  dwellMin: number
}
export interface GpsVehiclePoint {
  vehicleId: number
  plate: string
  path: [number, number][]
  visits: GpsVisitPoint[]
}
export interface GeofenceRow {
  siteId: number
  siteCode: string
  siteName: string
  kind: 'CIRCLE' | 'POLYGON'
  centerLat: number | null
  centerLng: number | null
  radiusM: number | null
  points: unknown
}

// เวลาไทย (เก็บ UTC-naive) → HH:mm
function hhmm(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false })
}

export default function GpsRouteMap({
  vehicle, geofences, height = 420,
}: {
  vehicle: GpsVehiclePoint | null
  geofences: GeofenceRow[]
  height?: number
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const rafRef = useRef<number | null>(null)   // frame ของ animation วาดเส้น

  // init
  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    const map = L.map(divRef.current, { center: [13.736, 100.523], zoom: 6 })
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    setTimeout(() => map.invalidateSize(), 50)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      map.remove(); mapRef.current = null; layerRef.current = null
    }
  }, [])

  // redraw dynamic content
  useEffect(() => {
    const map = mapRef.current, group = layerRef.current
    if (!map || !group) return
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }  // ยกเลิก animation เก่า
    group.clearLayers()

    // geofence ทุกไซต์ (พื้นหลังจาง)
    const gfPts: [number, number][] = []
    for (const g of geofences) {
      const style = { color: '#10b981', weight: 1.5, fillColor: '#10b981', fillOpacity: 0.08 }
      let shape: L.Layer | null = null
      if (g.kind === 'CIRCLE' && g.centerLat != null && g.centerLng != null && g.radiusM != null) {
        shape = L.circle([g.centerLat, g.centerLng], { radius: g.radiusM, ...style })
        gfPts.push([g.centerLat, g.centerLng])
      } else if (g.kind === 'POLYGON' && Array.isArray(g.points)) {
        const pts = (g.points as [number, number][]).filter((p) => Array.isArray(p) && p.length >= 2)
        if (pts.length >= 3) { shape = L.polygon(pts, style); gfPts.push(...pts) }
      }
      if (shape) { shape.bindTooltip(`${g.siteCode} · ${g.siteName}`, { direction: 'top' }); group.addLayer(shape) }
    }

    if (!vehicle) {
      // ไม่มีคันที่เลือก — โชว์ภาพรวม geofence
      if (gfPts.length > 0) {
        try { const b = L.latLngBounds(gfPts); if (b.isValid()) map.fitBounds(b.pad(0.2)) } catch { /* noop */ }
      }
      return
    }

    // จุดจอด (แสดงตลอด ช่วยอ้างอิงตำแหน่ง)
    for (const v of vehicle.visits) {
      const atSite = v.siteId != null
      const m = L.circleMarker([v.lat, v.lng], {
        radius: 7, color: atSite ? '#059669' : '#f59e0b', weight: 2,
        fillColor: atSite ? '#10b981' : '#fbbf24', fillOpacity: 0.9,
      })
      const label = atSite ? `${v.siteCode} · ${v.siteName}` : (v.rawPlace || 'จุดจอด')
      m.bindPopup(`<b>${label}</b><br/>${hhmm(v.arriveAt)}–${hhmm(v.departAt)} · จอด ${v.dwellMin} นาที`)
      group.addLayer(m)
    }

    // fit ให้พอดีเส้นทาง+จุดจอด (ตั้งมุมมองก่อนเริ่มวาด)
    const fitPts: [number, number][] = [...vehicle.path, ...vehicle.visits.map((v) => [v.lat, v.lng] as [number, number])]
    if (fitPts.length > 0) {
      try { const b = L.latLngBounds(fitPts); if (b.isValid()) map.fitBounds(b.pad(0.2), { animate: false }) } catch { /* noop */ }
    }

    // ── วาดเส้นทางแบบ animation (3 วินาที คงที่ ตามระยะทางจริง) ──
    const path = vehicle.path
    const line = L.polyline([], { color: '#2563eb', weight: 3.5, opacity: 0.9, lineJoin: 'round', lineCap: 'round' })
    group.addLayer(line)

    if (path.length < 2) return
    const latlngs = path.map((p) => L.latLng(p[0], p[1]))

    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) { line.setLatLngs(latlngs); return }

    // ระยะสะสมตามเส้นทาง (เมตร) → ใช้คุมความเร็วให้สม่ำเสมอ
    const cum: number[] = [0]
    for (let i = 1; i < latlngs.length; i++) cum[i] = cum[i - 1] + map.distance(latlngs[i - 1], latlngs[i])
    const total = cum[cum.length - 1]
    if (total <= 0) { line.setLatLngs(latlngs); return }

    // หัวจุดวิ่งนำเส้น
    const head = L.circleMarker(latlngs[0], { radius: 5, color: '#1d4ed8', weight: 2, fillColor: '#ffffff', fillOpacity: 1 })
    group.addLayer(head)

    const DURATION = 3000
    const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
    let start = 0

    const step = (now: number) => {
      if (!start) start = now
      const t = Math.min(1, (now - start) / DURATION)
      const d = easeInOutCubic(t) * total

      // หาจุดบนเส้นทางที่ระยะสะสม = d (interpolate ในช่วง segment)
      let k = 1
      while (k < cum.length && cum[k] < d) k++
      const seg = cum[k] - cum[k - 1] || 1
      const r = Math.max(0, Math.min(1, (d - cum[k - 1]) / seg))
      const a = latlngs[k - 1], b = latlngs[Math.min(k, latlngs.length - 1)]
      const hLat = a.lat + (b.lat - a.lat) * r
      const hLng = a.lng + (b.lng - a.lng) * r

      const partial = latlngs.slice(0, k)
      partial.push(L.latLng(hLat, hLng))
      line.setLatLngs(partial)
      head.setLatLng([hLat, hLng])

      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        line.setLatLngs(latlngs)          // ปิดท้ายให้ครบเส้นพอดี
        group.removeLayer(head)           // เอาหัวออกเมื่อถึงปลายทาง
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }, [vehicle, geofences])

  return <div ref={divRef} style={{ height }} className="w-full rounded-lg border border-slate-200" />
}

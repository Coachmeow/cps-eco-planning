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
  vehicle, geofences,
}: {
  vehicle: GpsVehiclePoint | null
  geofences: GeofenceRow[]
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  // init
  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    const map = L.map(divRef.current, { center: [13.736, 100.523], zoom: 6 })
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    setTimeout(() => map.invalidateSize(), 50)
    return () => { map.remove(); mapRef.current = null; layerRef.current = null }
  }, [])

  // redraw dynamic content
  useEffect(() => {
    const map = mapRef.current, group = layerRef.current
    if (!map || !group) return
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

    // เส้นทางของคันที่เลือก
    if (vehicle.path.length >= 2) {
      group.addLayer(L.polyline(vehicle.path, { color: '#2563eb', weight: 3, opacity: 0.85 }))
    }
    // จุดจอด
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

    // fit ให้พอดีเส้นทาง+จุดจอด
    const pts: [number, number][] = [...vehicle.path, ...vehicle.visits.map((v) => [v.lat, v.lng] as [number, number])]
    if (pts.length > 0) {
      try { const b = L.latLngBounds(pts); if (b.isValid()) map.fitBounds(b.pad(0.2)) } catch { /* noop */ }
    }
  }, [vehicle, geofences])

  return <div ref={divRef} className="h-[420px] w-full rounded-lg border border-slate-200" />
}

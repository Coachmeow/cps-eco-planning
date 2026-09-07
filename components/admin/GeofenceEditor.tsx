'use client'

// ตัวแก้ Geofence ของไซต์ — แผนที่จริง (OpenStreetMap) + วาดวงกลม/สี่เหลี่ยม/รูปหลายเหลี่ยม
// โหลด client-only เท่านั้น (leaflet แตะ window) → import ผ่าน next/dynamic { ssr:false } ใน AdminView
import { useEffect, useRef, useState } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'

interface GeofenceRow {
  id: number
  kind: 'CIRCLE' | 'POLYGON'
  label: string | null
  centerLat: number | null
  centerLng: number | null
  radiusM: number | null
  points: unknown
}

type SaveShape =
  | { kind: 'CIRCLE'; centerLat: number; centerLng: number; radiusM: number }
  | { kind: 'POLYGON'; points: [number, number][] }

export default function GeofenceEditor({
  siteId, siteName, initialLat, initialLng, onClose,
}: {
  siteId: number
  siteName: string
  initialLat?: number | null
  initialLng?: number | null
  onClose: () => void
}) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [count, setCount] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    const fallback: [number, number] = [13.736, 100.523] // กลางไทย
    const start: [number, number] =
      initialLat != null && initialLng != null ? [initialLat, initialLng] : fallback

    const map = L.map(mapDivRef.current, { center: start, zoom: initialLat != null ? 14 : 6 })
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)

    // เครื่องมือวาด (ปิด marker/line/text — ใช้เฉพาะกรอบพื้นที่)
    map.pm.addControls({
      position: 'topleft',
      drawMarker: false, drawCircleMarker: false, drawPolyline: false, drawText: false,
      drawCircle: true, drawRectangle: true, drawPolygon: true,
      editMode: true, dragMode: true, cutPolygon: false, removalMode: true, rotateMode: false,
    })
    map.pm.setGlobalOptions({ pathOptions: { color: '#0ea5e9', fillOpacity: 0.15 } })

    // โหลดกรอบเดิม
    ;(async () => {
      try {
        const r = await fetch(`/api/sites/${siteId}/geofences`)
        const rows: GeofenceRow[] = await r.json()
        const drawn: L.Layer[] = []
        for (const g of rows) {
          if (g.kind === 'CIRCLE' && g.centerLat != null && g.centerLng != null && g.radiusM != null) {
            const c = L.circle([g.centerLat, g.centerLng], { radius: g.radiusM, color: '#0ea5e9', fillOpacity: 0.15 })
            c.addTo(map); drawn.push(c)
          } else if (g.kind === 'POLYGON' && Array.isArray(g.points)) {
            const pts = (g.points as [number, number][]).filter(p => Array.isArray(p) && p.length >= 2)
            if (pts.length >= 3) { const poly = L.polygon(pts, { color: '#0ea5e9', fillOpacity: 0.15 }); poly.addTo(map); drawn.push(poly) }
          }
        }
        setCount(rows.length)
        if (drawn.length > 0) {
          const grp = L.featureGroup(drawn)
          map.fitBounds(grp.getBounds().pad(0.3))
        }
      } catch {
        // ไม่มีกรอบเดิม / โหลดพลาด — เริ่มวาดใหม่ได้เลย
      } finally {
        setLoading(false)
        setTimeout(() => map.invalidateSize(), 50) // อยู่ใน modal → ต้อง recalc ขนาด
      }
    })()

    return () => { map.remove(); mapRef.current = null }
  }, [siteId, initialLat, initialLng])

  function collectShapes(map: L.Map): SaveShape[] {
    const shapes: SaveShape[] = []
    map.eachLayer((layer) => {
      if (layer instanceof L.Circle) {
        const ll = layer.getLatLng()
        shapes.push({ kind: 'CIRCLE', centerLat: ll.lat, centerLng: ll.lng, radiusM: layer.getRadius() })
      } else if (layer instanceof L.Polygon) {
        // Rectangle extends Polygon → ครอบคลุมทั้งคู่
        const latlngs = layer.getLatLngs()[0] as L.LatLng[]
        const pts = latlngs.map((p) => [p.lat, p.lng] as [number, number])
        if (pts.length >= 3) shapes.push({ kind: 'POLYGON', points: pts })
      }
    })
    return shapes
  }

  async function save() {
    const map = mapRef.current
    if (!map) return
    setSaving(true); setErr(null)
    try {
      map.pm.disableGlobalEditMode()
      const geofences = collectShapes(map)
      const r = await fetch(`/api/sites/${siteId}/geofences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geofences }),
      })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || 'บันทึกไม่สำเร็จ') }
      onClose()
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="font-semibold text-slate-800">Geofence — {siteName}</h3>
            <p className="text-xs text-slate-400">วาดวงกลม/สี่เหลี่ยม/รูปหลายเหลี่ยมครอบไซต์ · จุด GPS ที่ตกในกรอบ = อยู่ไซต์นี้</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
        </div>
        <div className="relative">
          <div ref={mapDivRef} className="h-[60vh] w-full" />
          {loading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/60 text-sm text-slate-500">กำลังโหลดแผนที่...</div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          <span className="text-xs text-slate-400">{err ? <span className="text-red-600">{err}</span> : `กรอบเดิม ${count} รายการ · ใช้เครื่องมือมุมซ้ายบนเพื่อวาด/แก้/ลบ`}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึก Geofence'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

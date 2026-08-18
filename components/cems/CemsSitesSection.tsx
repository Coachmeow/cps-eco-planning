'use client'

import { useCallback, useEffect, useState } from 'react'
import { Btn, Input } from '@/components/cems/ui'
import { DeleteConfirmModal, DeletionLogButton } from '@/components/DeleteControls'

export interface CemsSiteRow { id: number; code: string; name: string | null; isManual: boolean }

export default function CemsSitesSection({ canManage = false }: { canManage?: boolean }) {
  const [sites, setSites] = useState<CemsSiteRow[]>([])
  const [form, setForm]   = useState({ code: '', name: '' })
  const [editing, setEditing] = useState<CemsSiteRow | null>(null)
  const [saving, setSaving]   = useState(false)
  const [delTarget, setDelTarget] = useState<CemsSiteRow | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/cems/sites'); if (r.ok) setSites(await r.json())
  }, [])
  useEffect(() => { load() }, [load])

  async function seed() {
    if (!confirm('เพิ่มชุดไซต์เริ่มต้น (SKK3..SWCC2 รวม 15 ไซต์)?')) return
    await fetch('/api/cems/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: true }) })
    load()
  }

  async function save() {
    if (!form.code) return
    setSaving(true)
    const res = editing
      ? await fetch(`/api/cems/sites/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      : await fetch('/api/cems/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'บันทึกไม่สำเร็จ'); return }
    setForm({ code: '', name: '' }); setEditing(null); load()
  }

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="w-40"><Input label="โค้ดไซต์" value={form.code} onChange={(v) => setForm(p => ({ ...p, code: v }))} placeholder="เช่น SKK3" required /></div>
          <div className="flex-1 min-w-[180px]"><Input label="ชื่อ (ไม่บังคับ)" value={form.name} onChange={(v) => setForm(p => ({ ...p, name: v }))} placeholder="ชื่อโรงงาน/หมายเหตุ" /></div>
          {editing && <Btn variant="danger" onClick={() => { setDelTarget(editing); setEditing(null); setForm({ code: '', name: '' }) }}>ลบถาวร</Btn>}
          {editing && <Btn variant="ghost" onClick={() => { setEditing(null); setForm({ code: '', name: '' }) }}>ยกเลิกแก้</Btn>}
          <Btn onClick={save}>{saving ? 'กำลังบันทึก...' : editing ? 'บันทึกการแก้ไข' : '+ เพิ่มไซต์'}</Btn>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-400">{sites.length} ไซต์</p>
        <div className="flex gap-2">
          {canManage && <DeletionLogButton group="cems" />}
          {canManage && sites.length === 0 && <Btn variant="ghost" onClick={seed}>⚡ เพิ่มชุดไซต์เริ่มต้น (15 ไซต์)</Btn>}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>
            <th className="px-4 py-2 text-left font-medium">โค้ด</th>
            <th className="px-4 py-2 text-left font-medium">ชื่อ</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {sites.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-xs text-slate-300">ยังไม่มีไซต์ — กดปุ่ม "เพิ่มชุดไซต์เริ่มต้น" ได้เลย</td></tr>}
            {sites.map(s => (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-700">{s.code}</td>
                <td className="px-4 py-2 text-slate-500">{s.name ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  {canManage && <Btn small onClick={() => { setEditing(s); setForm({ code: s.code, name: s.name ?? '' }) }}>แก้</Btn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {delTarget && (
        <DeleteConfirmModal
          token={delTarget.code}
          label={`CEMS ไซต์ ${delTarget.code}`}
          impact={['ลบได้เฉพาะไซต์ที่ไม่มีเครื่อง/งานผูกอยู่ — ถ้ามีจะลบไม่ได้']}
          endpoint={`/api/cems/sites/${delTarget.id}`}
          onClose={() => setDelTarget(null)}
          onDone={() => { setDelTarget(null); load() }}
        />
      )}
    </div>
  )
}

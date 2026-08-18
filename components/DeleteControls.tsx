'use client'

/**
 * ชุดควบคุมการลบแบบปลอดภัย ใช้ร่วมทั้งฝั่ง Admin และ CEMS
 *  - DeleteConfirmModal: พิมพ์ยืนยัน + เหตุผล → ยิง DELETE (แนบ reason) ; log ฝั่ง server
 *  - DeletionLogButton: ปุ่ม + modal ดูประวัติการลบ (กรองด้วย group)
 * เป็น self-contained (ไม่พึ่ง component ของหน้าไหน) เพื่อให้ import ไปใช้ที่ไหนก็ได้
 */
import { useState } from 'react'

export interface DeletionLogRow {
  id: number; entityType: string; entityLabel: string; reason: string | null; deletedByName: string; createdAt: string
}

const ENTITY_LABEL: Record<string, string> = {
  equipment: 'เครื่องมือ', vehicle: 'รถ', employee: 'พนักงาน', site: 'ไซต์งาน',
  'cems-analyzer': 'CEMS Analyzer', 'cems-site': 'CEMS ไซต์', 'cems-part': 'CEMS อะไหล่',
  'cems-schedule': 'CEMS แผนอะไหล่', 'cems-gas': 'CEMS แก๊ส',
}

// ── overlay modal เล็กๆ (self-contained) ──
function Shell({ title, wide, onClose, children }: { title: string; wide?: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
      <div className={`flex max-h-[90vh] w-full ${wide ? 'max-w-2xl' : 'max-w-md'} flex-col rounded-xl bg-white shadow-2xl`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-600">×</button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

const btnGhost  = 'rounded px-3.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100'
const btnDanger = 'rounded px-3.5 py-1.5 text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50'

export function DeleteConfirmModal({ token, label, impact, endpoint, onClose, onDone }: {
  token: string; label: string; impact: string[]; endpoint: string; onClose: () => void; onDone: () => void
}) {
  const [text, setText] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false)
  async function go() {
    if (text.trim() !== token) return
    setBusy(true)
    const res = await fetch(endpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
    setBusy(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error ?? 'ลบไม่สำเร็จ'); return }
    onDone()
  }
  return (
    <Shell title="⚠ ยืนยันการลบถาวร" onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          กำลังจะลบ <b>{label}</b> ออกจากระบบถาวร
          {impact.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-red-600">{impact.map((s, i) => <li key={i}>{s}</li>)}</ul>}
          <p className="mt-1.5 text-xs">ข้อมูลคนลบและวันที่ลบจะถูกเก็บในระบบ</p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">พิมพ์ <b className="font-mono text-slate-800">{token}</b> เพื่อยืนยัน</label>
          <input value={text} onChange={e => setText(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-red-400 focus:outline-none" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">เหตุผลที่ลบ (ไม่บังคับ)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="เช่น กรอกซ้ำ / กรอกผิด"
            className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className={btnGhost} onClick={onClose}>ยกเลิก</button>
          <button className={btnDanger} onClick={go} disabled={busy || text.trim() !== token}>{busy ? 'กำลังลบ...' : 'ลบถาวร'}</button>
        </div>
      </div>
    </Shell>
  )
}

export function DeletionLogButton({ group }: { group?: 'cems' | 'planning' }) {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<DeletionLogRow[]>([])
  async function openLog() {
    setOpen(true)
    const q = group ? `?group=${group}` : ''
    const d = await fetch(`/api/deletion-logs${q}`).then(r => r.json()).catch(() => [])
    setLogs(Array.isArray(d) ? d : [])
  }
  return (
    <>
      <button onClick={openLog} className="rounded px-3.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100">🗑 ประวัติการลบ</button>
      {open && (
        <Shell wide title="🗑 ประวัติการลบข้อมูล" onClose={() => setOpen(false)}>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500"><tr>
                <th className="px-3 py-2 text-left font-medium">เมื่อ</th>
                <th className="px-3 py-2 text-left font-medium">ประเภท</th>
                <th className="px-3 py-2 text-left font-medium">รายการ</th>
                <th className="px-3 py-2 text-left font-medium">ผู้ลบ</th>
                <th className="px-3 py-2 text-left font-medium">เหตุผล</th>
              </tr></thead>
              <tbody>
                {logs.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-300">ยังไม่มีประวัติการลบ</td></tr>}
                {logs.map(l => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{new Date(l.createdAt).toLocaleString('th-TH')}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{ENTITY_LABEL[l.entityType] ?? l.entityType}</td>
                    <td className="px-3 py-2 text-slate-700">{l.entityLabel}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{l.deletedByName}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">{l.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Shell>
      )}
    </>
  )
}

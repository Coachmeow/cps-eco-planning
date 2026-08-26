'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Cpu, StickyNote } from 'lucide-react'
import { Btn, Input, CustomSelect, OWNERSHIP_LABEL, OWNERSHIP_CHIP, AN_STATUS_LABEL, AN_STATUS_CHIP, EVENT_META, fmtDate, ageText } from '@/components/cems/ui'
import type { CemsSiteRow } from '@/components/cems/CemsSitesSection'

interface EventRow {
  id: number; type: string; eventDate: string; symptom: string | null; action: string | null
  site: { code: string } | null; vendor: string | null; receiver: string | null; reporter: string | null; notes: string | null; createdAt: string
}
interface PartTxnRow {
  id: number; qty: number; txnDate: string; quoteNo: string | null; person: string | null; notes: string | null
  part: { code: string; name: string; unit: string | null }; site: { code: string } | null
}
interface Detail {
  id: number; tag: string; brand: string | null; model: string | null; serialNo: string | null
  parameter: string | null; ownership: string; status: string
  homeSite: { code: string } | null; currentSite: { code: string } | null
  receivedDate: string | null; statusUpdatedAt: string; notes: string | null
  hasPhoto?: boolean; events: EventRow[]; partTxns: PartTxnRow[]
}

const EVENT_TYPES = ['REPAIR', 'RETURN', 'MOVE', 'PM', 'ISSUE']

export default function AnalyzerCard({ analyzerId, sites, onClose, canManage = false }: { analyzerId: number; sites: CemsSiteRow[]; onClose: () => void; canManage?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [a, setA]   = useState<Detail | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [evForm, setEvForm]     = useState({ type: 'REPAIR', eventDate: new Date().toLocaleDateString('en-CA'), symptom: '', action: '', siteId: '', vendor: '', receiver: '', reporter: '', notes: '' })

  const load = useCallback(() => {
    fetch(`/api/cems/analyzers/${analyzerId}`).then(r => r.json()).then(setA).catch(() => {})
  }, [analyzerId])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !qr) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose, qr])

  async function showQR() {
    const r = await fetch(`/api/cems/analyzers/${analyzerId}/qr`)
    if (!r.ok) return
    const { token } = await r.json()
    setQr(await QRCode.toDataURL(`${window.location.origin}/a/${token}`, { width: 320, margin: 2 }))
  }

  function downloadQR() {
    if (!qr || !a) return
    const name = a.tag.replace(/[\\/:*?"<>|\s]+/g, '')
    const el = document.createElement('a')
    el.href = qr; el.download = `QR_CEMS_${name}.png`; el.click()
  }

  function printQR() {
    if (!qr || !a) return
    const w = window.open('', '_blank', 'width=420,height=620')
    if (!w) { alert('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองใหม่'); return }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR ${a.tag}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box;font-family:system-ui,'Segoe UI',sans-serif}
      body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}
      .tag{font-size:12px;letter-spacing:2px;color:#0284c7;font-weight:700}
      .plate{font-size:26px;font-weight:800;color:#1e293b;margin:6px 0 2px}
      .hint{font-size:13px;color:#64748b;margin-bottom:16px}
      img{width:300px;height:300px}.foot{font-size:12px;color:#94a3b8;margin-top:14px}</style></head>
      <body><div class="tag">Eco Planning System · CEMS SERVICE</div>
      <div class="plate">📟 ${a.tag}</div>
      <div class="hint">${[a.brand, a.model].filter(Boolean).join(' · ')}</div>
      <img src="${qr}" alt="QR" />
      <div class="foot">สแกนเพื่อแจ้งอาการผิดปกติ / บันทึกเข้า PM (ไม่ต้องล็อกอิน)</div>
      <script>const img=document.querySelector('img');function go(){window.focus();window.print();}
      if(img.complete)go();else img.onload=go;window.onafterprint=()=>window.close();<\/script></body></html>`)
    w.document.close()
  }

  async function saveEvent() {
    setSaving(true)
    const res = await fetch('/api/cems/analyzer-events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analyzerId, ...evForm, siteId: evForm.siteId || null }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'บันทึกไม่สำเร็จ'); return }
    setShowForm(false)
    setEvForm({ type: 'REPAIR', eventDate: new Date().toLocaleDateString('en-CA'), symptom: '', action: '', siteId: '', vendor: '', receiver: '', reporter: '', notes: '' })
    load()
  }

  async function delEvent(ev: EventRow) {
    if (!confirm(`ลบประวัติ "${EVENT_META[ev.type]?.label}" วันที่ ${fmtDate(ev.eventDate)} ?`)) return
    await fetch(`/api/cems/analyzer-events/${ev.id}`, { method: 'DELETE' }); load()
  }

  const ef = (k: keyof typeof evForm) => (v: string) => setEvForm(p => ({ ...p, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div ref={ref} className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {!a ? <div className="p-8 text-center text-sm text-slate-400">กำลังโหลด...</div> : (
          <>
            {/* header */}
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              {a.hasPhoto
                ? <img src={`/api/cems/analyzers/${a.id}/photo`} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100"><Cpu className="h-7 w-7 text-slate-400" /></span>}
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-bold text-slate-800">{a.tag}</p>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${AN_STATUS_CHIP[a.status]}`}>{AN_STATUS_LABEL[a.status]}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${OWNERSHIP_CHIP[a.ownership]}`}>{OWNERSHIP_LABEL[a.ownership]}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{[a.brand, a.model, a.serialNo].filter(Boolean).join(' · ') || '—'}</p>
                <p className="text-xs text-slate-400">{a.parameter && <>วัด {a.parameter} · </>}อยู่ที่ <b className="text-slate-600">{a.currentSite?.code ?? 'หน่วยงาน (Pool)'}</b>{a.homeSite && <> · เจ้าของ {a.homeSite.code}</>}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
                <button onClick={showQR} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50">QR</button>
              </div>
            </div>

            {/* stats */}
            <div className="grid grid-cols-3 gap-2 px-5 py-3">
              <div className="rounded-lg bg-sky-50 px-2 py-2 text-center">
                <p className="text-sm font-bold text-sky-700">{ageText(a.receivedDate)}</p>
                <p className="text-[10px] text-slate-500">อายุใช้งาน {a.receivedDate && `(รับ ${fmtDate(a.receivedDate)})`}</p>
              </div>
              <div className="rounded-lg bg-red-50 px-2 py-2 text-center">
                <p className="text-sm font-bold text-red-600">{a.events.filter(e => e.type === 'REPAIR').length}</p>
                <p className="text-[10px] text-slate-500">ครั้งที่ส่งซ่อม</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
                <p className="text-sm font-bold text-slate-700">{fmtDate(a.statusUpdatedAt)}</p>
                <p className="text-[10px] text-slate-500">อัพเดทล่าสุด</p>
              </div>
            </div>
            {a.notes && <p className="px-5 pb-1 text-xs text-amber-600"><StickyNote className="inline h-3 w-3 align-[-1px]" /> {a.notes}</p>}

            {/* ประวัติเปลี่ยนอะไหล่ (ตรึงกับเครื่องนี้ แม้ย้าย/ปลดระวางก็ไม่หลุด) */}
            {a.partTxns.length > 0 && (
              <div className="border-t border-slate-100 px-5 py-3">
                <p className="mb-2 text-xs font-semibold text-slate-500">ประวัติเปลี่ยนอะไหล่ ({a.partTxns.length})</p>
                <div className="space-y-1.5">
                  {a.partTxns.map(t => (
                    <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-1.5 text-xs">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-700">{t.part.code}</span>
                        <span className="text-slate-400"> · {t.part.name}</span>
                        <span className="ml-1 text-slate-500">×{t.qty}{t.part.unit ? ` ${t.part.unit}` : ''}</span>
                        {(t.site?.code || t.quoteNo) && <span className="text-[10px] text-slate-400"> · {[t.site?.code, t.quoteNo].filter(Boolean).join(' · ')}</span>}
                      </div>
                      <span className="shrink-0 text-slate-400">{fmtDate(t.txnDate)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* timeline */}
            <div className="flex-1 overflow-y-auto border-t border-slate-100 px-5 py-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">ประวัติ ({a.events.length})</p>
                <Btn small onClick={() => setShowForm(s => !s)}>{showForm ? '− ปิดฟอร์ม' : '+ เพิ่มประวัติ'}</Btn>
              </div>

              {showForm && (
                <div className="mb-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-600">ประเภท</label>
                      <CustomSelect value={evForm.type} onChange={ef('type')}
                        options={EVENT_TYPES.map(t => ({ value: t, label: `${EVENT_META[t].icon} ${EVENT_META[t].label}` }))} />
                    </div>
                    <Input label="วันที่" value={evForm.eventDate} onChange={ef('eventDate')} type="date" />
                  </div>
                  {(evForm.type === 'REPAIR' || evForm.type === 'ISSUE') && (
                    <Input label="อาการ / สาเหตุ" value={evForm.symptom} onChange={ef('symptom')} placeholder="เช่น ค่าเพี้ยน, เซนเซอร์เสีย" />
                  )}
                  {(evForm.type === 'RETURN' || evForm.type === 'PM') && (
                    <Input label="สิ่งที่ทำ / ผล" value={evForm.action} onChange={ef('action')} placeholder="เช่น เปลี่ยนเซลล์, สอบเทียบแล้ว" />
                  )}
                  {evForm.type === 'MOVE' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-600">ย้ายไปที่</label>
                      <CustomSelect value={evForm.siteId} onChange={ef('siteId')}
                        options={[{ value: '', label: 'หน่วยงาน (Pool)' }, ...sites.map(s => ({ value: String(s.id), label: s.code }))]} />
                    </div>
                  )}
                  {(evForm.type === 'REPAIR' || evForm.type === 'RETURN') && (
                    <Input label="Vendor / สถานที่ส่งซ่อม" value={evForm.vendor} onChange={ef('vendor')} placeholder="บ. ..." />
                  )}
                  {evForm.type === 'REPAIR' && (
                    <Input label="ผู้รับเครื่อง (ฝั่งผู้ซ่อม)" value={evForm.receiver} onChange={ef('receiver')} placeholder="เช่น คุณสมชาย" />
                  )}
                  <Input label="หมายเหตุ" value={evForm.notes} onChange={ef('notes')} placeholder="..." />
                  <div className="flex justify-end"><Btn onClick={saveEvent}>{saving ? 'กำลังบันทึก...' : 'บันทึกประวัติ'}</Btn></div>
                </div>
              )}

              {a.events.length === 0 ? <p className="py-4 text-center text-xs text-slate-300">ยังไม่มีประวัติ</p> : (
                <div className="space-y-2">
                  {a.events.map(ev => {
                    const meta = EVENT_META[ev.type] ?? { label: ev.type, icon: '•', chip: 'bg-slate-100 text-slate-600' }
                    return (
                      <div key={ev.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.chip}`}>{meta.icon} {meta.label}{ev.type === 'MOVE' && <> → {ev.site?.code ?? 'หน่วยงาน'}</>}</span>
                          <span className="flex items-center gap-2 text-slate-400">
                            {fmtDate(ev.eventDate)}
                            {canManage && <button onClick={() => delEvent(ev)} className="text-red-300 hover:text-red-500">ลบ</button>}
                          </span>
                        </div>
                        {ev.symptom && <p className="mt-1 text-slate-600">อาการ: {ev.symptom}</p>}
                        {ev.action && <p className="mt-0.5 text-slate-600">ทำ: {ev.action}</p>}
                        {(ev.vendor || ev.receiver) && <p className="mt-0.5 text-slate-400">{ev.vendor && `ส่งซ่อม: ${ev.vendor}`}{ev.vendor && ev.receiver && ' · '}{ev.receiver && `ผู้รับ: ${ev.receiver}`}</p>}
                        {ev.reporter && <p className="mt-0.5 text-slate-400">ผู้แจ้ง: {ev.reporter}</p>}
                        {ev.notes && <p className="mt-0.5 text-amber-600"><StickyNote className="inline h-3 w-3 align-[-1px]" /> {ev.notes}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* QR modal */}
      {qr && a && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setQr(null)}>
          <div className="rounded-2xl bg-white p-5 text-center shadow-2xl" onMouseDown={e => e.stopPropagation()}>
            <p className="mb-1 text-sm font-bold text-slate-800">QR ประจำเครื่อง</p>
            <p className="mb-3 text-xs text-slate-400">{a.tag} — สแกนเพื่อแจ้งซ่อม/บันทึก PM (ไม่ต้องล็อกอิน)</p>
            <img src={qr} alt="QR" className="mx-auto h-64 w-64" />
            <div className="mt-4 flex gap-2">
              <button onClick={() => setQr(null)} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-500 hover:bg-slate-100">ปิด</button>
              <button onClick={downloadQR} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">↓ ดาวน์โหลด</button>
              <button onClick={printQR} className="flex-1 rounded-lg bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800">ปริ้น</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

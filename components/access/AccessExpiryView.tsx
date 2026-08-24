'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Employee } from '@/lib/types'

type Urgency = 'expired' | 'urgent' | 'warning' | 'ok'

function getUrgency(expiryDate: string): Urgency {
  const today = new Date(); today.setHours(0,0,0,0)
  const exp   = new Date(expiryDate); exp.setHours(0,0,0,0)
  const diff  = Math.floor((exp.getTime()-today.getTime())/86400000)
  if (diff < 0)  return 'expired'
  if (diff < 7)  return 'urgent'
  if (diff < 30) return 'warning'
  return 'ok'
}
function rowStyle(u: Urgency) {
  switch(u) {
    case 'expired': return 'bg-red-100 text-red-700 border-red-200'
    case 'urgent':  return 'bg-red-50  text-red-600 border-red-100'
    case 'warning': return 'bg-amber-50 text-amber-700 border-amber-100'
    default:        return 'bg-white text-slate-600 border-slate-100'
  }
}
function badge(u: Urgency) {
  switch(u) {
    case 'expired': return { label: 'หมดแล้ว', cls: 'bg-red-500 text-white' }
    case 'urgent':  return { label: '< 7 วัน', cls: 'bg-red-100 text-red-600' }
    case 'warning': return { label: '< 30 วัน', cls: 'bg-amber-100 text-amber-600' }
    default:        return { label: 'ปกติ', cls: 'bg-slate-100 text-slate-500' }
  }
}
function daysLeft(d: string) { const t=new Date();t.setHours(0,0,0,0);const e=new Date(d);e.setHours(0,0,0,0);return Math.floor((e.getTime()-t.getTime())/86400000) }

const TEAM_COLOR: Record<string, string> = {
  ST:'bg-slate-200 text-slate-700',AMB:'bg-teal-100 text-teal-700',WP:'bg-purple-100 text-purple-700',
  CEMS:'bg-orange-100 text-orange-700',WT:'bg-blue-100 text-blue-700',LOG:'bg-gray-100 text-gray-600',
}

export default function AccessExpiryView() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading,   setLoading]   = useState(true)
  const [editId,    setEditId]    = useState<number|null>(null)
  const [editDate,  setEditDate]  = useState('')
  const [filter,    setFilter]    = useState<'all'|'expiring'>('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/access-expiry')
    setEmployees(await res.json())
    setLoading(false)
  }, [])
  useEffect(() => { fetchData() }, [fetchData])

  const alertCount = employees.reduce((s,emp) => s+emp.siteAccess.filter(a=>getUrgency(a.expiryDate)!=='ok').length, 0)

  async function handleUpdate(id: number) {
    if (!editDate) return
    await fetch(`/api/access-expiry/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiryDate:editDate})})
    setEditId(null); await fetchData()
  }

  const filtered = filter==='expiring' ? employees.filter(e=>e.siteAccess.some(a=>getUrgency(a.expiryDate)!=='ok')) : employees

  return (
    <div className="h-full overflow-auto bg-slate-50 p-6">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-base font-semibold text-slate-800">Access Expiry</h1>
        {alertCount>0&&<span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600"><AlertTriangle className="h-3 w-3" /> {alertCount} รายการ</span>}
        <div className="ml-auto flex gap-2">
          {(['all','expiring'] as const).map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${filter===f?'bg-slate-700 text-white':'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
              {f==='all'?'ทั้งหมด':'ใกล้หมด / หมดแล้ว'}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="flex h-64 items-center justify-center text-sm text-slate-400">กำลังโหลด...</div> : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                {['พนักงาน','ทีม','ไซต์','วันหมดอายุ','คงเหลือ','สถานะ',''].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp=>
                emp.siteAccess.length===0 ? (
                  <tr key={emp.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 text-slate-700">{emp.nickname??emp.fullName}</td>
                    <td className="px-4 py-3"><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TEAM_COLOR[emp.primaryTeam.code]}`}>{emp.primaryTeam.code}</span></td>
                    <td colSpan={4} className="px-4 py-3 text-xs text-slate-300">ไม่มีสิทธิ์พิเศษ</td>
                  </tr>
                ) : emp.siteAccess.map((access,idx)=>{
                  const u=getUrgency(access.expiryDate); const b=badge(u); const rs=rowStyle(u); const dl=daysLeft(access.expiryDate)
                  return (
                    <tr key={access.id} className={`border-b border-slate-50 ${rs} transition-colors`}>
                      {idx===0&&<td className="px-4 py-3 font-medium" rowSpan={emp.siteAccess.length}>{emp.nickname??emp.fullName}<div className="text-[11px] text-slate-400 font-normal">{emp.fullName}</div></td>}
                      {idx===0&&<td className="px-4 py-3" rowSpan={emp.siteAccess.length}><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TEAM_COLOR[emp.primaryTeam.code]}`}>{emp.primaryTeam.code}</span></td>}
                      <td className="px-4 py-3 font-medium">{access.siteCode}</td>
                      <td className="px-4 py-3">
                        {editId===access.id
                          ? <input type="date" defaultValue={access.expiryDate.slice(0,10)} onChange={e=>setEditDate(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none" />
                          : new Date(access.expiryDate).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})}
                      </td>
                      <td className="px-4 py-3 text-xs">{dl<0?`หมดแล้ว ${Math.abs(dl)} วัน`:`${dl} วัน`}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${b.cls}`}>{b.label}</span></td>
                      <td className="px-4 py-3 text-right">
                        {editId===access.id
                          ? <div className="flex gap-1 justify-end">
                              <button onClick={()=>handleUpdate(access.id)} className="rounded bg-slate-700 px-2 py-1 text-xs text-white">บันทึก</button>
                              <button onClick={()=>setEditId(null)} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500">ยกเลิก</button>
                            </div>
                          : <button onClick={()=>{setEditId(access.id);setEditDate(access.expiryDate.slice(0,10))}} className="text-xs text-slate-400 hover:text-slate-600">แก้ไข</button>}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          {filtered.length===0&&<div className="py-16 text-center text-sm text-slate-300">{filter==='expiring'?'ไม่มีสิทธิ์ที่ใกล้หมดอายุ':'ไม่มีข้อมูล'}</div>}
        </div>
      )}
    </div>
  )
}

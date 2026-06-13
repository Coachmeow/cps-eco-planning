'use client'

import { useState } from 'react'

const PALETTE = [
  'bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-rose-500',
  'bg-amber-500', 'bg-teal-500', 'bg-indigo-500', 'bg-pink-500',
]

const SIZES: Record<string, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-24 w-24 text-2xl',
}

interface Props {
  employeeId: number
  name:       string
  hasPhoto?:  boolean
  size?:      keyof typeof SIZES
  className?: string
}

export default function Avatar({ employeeId, name, hasPhoto, size = 'sm', className = '' }: Props) {
  const [failed, setFailed] = useState(false)
  const initial = (name?.trim()?.charAt(0) ?? '?').toUpperCase()
  const color   = PALETTE[employeeId % PALETTE.length]
  const sizeCls = SIZES[size]

  if (hasPhoto && !failed) {
    return (
      <img
        src={`/api/employees/${employeeId}/photo`}
        alt={name}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${sizeCls} ${className}`}
      />
    )
  }
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${color} ${sizeCls} ${className}`}>
      {initial}
    </span>
  )
}

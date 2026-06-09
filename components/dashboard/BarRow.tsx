interface Props {
  label: string; value: number; maxValue?: number; displayText: string; color: string
}
export default function BarRow({ label, value, maxValue = 100, displayText, color }: Props) {
  const pct = Math.min((value / maxValue) * 100, 100)
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-right text-xs text-slate-500 truncate" title={label}>{label}</span>
      <div className="relative flex h-5 flex-1 overflow-hidden rounded bg-slate-100">
        <div className={`h-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-xs font-medium text-slate-700">{displayText}</span>
    </div>
  )
}

// Single source of truth for team color → Tailwind class mapping (calendar cells).
// hue = ทีมของงาน ; tier (0–3) = กลุ่มไซต์ (ไซต์เดียวกัน→เฉดเดียวกัน = ไปด้วยกัน)
// All class strings written out in full (no dynamic interpolation) to survive Tailwind purge.

export const TEAM_TIERS = 4

// โทนสีต่อทีม (อิงจาก TEAM_FILTER_COLOR/TEAM_RING เดิม)
export const TEAM_HUE: Record<string, string> = {
  ST: 'slate', AMB: 'teal', WP: 'purple', CEMS: 'orange', WT: 'blue', LOG: 'gray',
}

// 4 เฉดต่อทีม — index = tier
export const TEAM_CELL: Record<string, string[]> = {
  ST: [
    'bg-slate-50  border border-slate-200 text-slate-800',
    'bg-slate-100 border border-slate-300 text-slate-800',
    'bg-slate-200 border border-slate-300 text-slate-900',
    'bg-slate-300 border border-slate-400 text-slate-900',
  ],
  AMB: [
    'bg-teal-50  border border-teal-200 text-teal-800',
    'bg-teal-100 border border-teal-300 text-teal-800',
    'bg-teal-200 border border-teal-300 text-teal-900',
    'bg-teal-300 border border-teal-400 text-teal-900',
  ],
  WP: [
    'bg-purple-50  border border-purple-200 text-purple-800',
    'bg-purple-100 border border-purple-300 text-purple-800',
    'bg-purple-200 border border-purple-300 text-purple-900',
    'bg-purple-300 border border-purple-400 text-purple-900',
  ],
  CEMS: [
    'bg-orange-50  border border-orange-200 text-orange-800',
    'bg-orange-100 border border-orange-300 text-orange-800',
    'bg-orange-200 border border-orange-300 text-orange-900',
    'bg-orange-300 border border-orange-400 text-orange-900',
  ],
  WT: [
    'bg-blue-50  border border-blue-200 text-blue-800',
    'bg-blue-100 border border-blue-300 text-blue-800',
    'bg-blue-200 border border-blue-300 text-blue-900',
    'bg-blue-300 border border-blue-400 text-blue-900',
  ],
  LOG: [
    'bg-gray-50  border border-gray-200 text-gray-700',
    'bg-gray-100 border border-gray-300 text-gray-800',
    'bg-gray-200 border border-gray-300 text-gray-900',
    'bg-gray-300 border border-gray-400 text-gray-900',
  ],
}

/** คืน Tailwind class ของช่องปฏิทินตามทีม + tier ; fallback → slate tier0 */
export function teamCellClass(teamCode: string | null | undefined, tier = 0): string {
  const tiers = TEAM_CELL[teamCode ?? ''] ?? TEAM_CELL.ST
  return tiers[tier % TEAM_TIERS] ?? tiers[0]
}

/**
 * จับคู่ (ทีม, ไซต์) → tier ให้เฉดคงที่และลดการชนกันในทีมเดียวกัน
 * pack เฉดต่อทีม: เรียง siteId แล้ว tier = ลำดับ % TEAM_TIERS
 * key = `${team}:${siteId}`
 */
export function buildSiteTierMap(pairs: { team: string; siteId: number }[]): Map<string, number> {
  // team → เซตของ siteId
  const byTeam = new Map<string, Set<number>>()
  for (const { team, siteId } of pairs) {
    if (!byTeam.has(team)) byTeam.set(team, new Set())
    byTeam.get(team)!.add(siteId)
  }
  const out = new Map<string, number>()
  for (const [team, siteSet] of byTeam) {
    const sorted = Array.from(siteSet).sort((a, b) => a - b)
    sorted.forEach((siteId, i) => out.set(`${team}:${siteId}`, i % TEAM_TIERS))
  }
  return out
}

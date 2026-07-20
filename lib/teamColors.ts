// Single source of truth for team color → Tailwind class mapping (calendar cells).
// hue = ทีมของงาน ; tier (0–3) = กลุ่มไซต์ (ไซต์เดียวกัน→เฉดเดียวกัน = ไปด้วยกัน)
// All class strings written out in full (no dynamic interpolation) to survive Tailwind purge.

export const TEAM_TIERS = 4

// โทนสีต่อทีม (อิงจาก TEAM_FILTER_COLOR/TEAM_RING เดิม)
export const TEAM_HUE: Record<string, string> = {
  ST: 'blue', AMB: 'teal', WP: 'purple', CEMS: 'orange', WT: 'cyan', LOG: 'gray',
}

// 4 เฉดต่อทีม — index = tier
export const TEAM_CELL: Record<string, string[]> = {
  ST: [
    'bg-blue-50  border border-blue-200 text-blue-800',
    'bg-blue-100 border border-blue-300 text-blue-800',
    'bg-blue-200 border border-blue-300 text-blue-900',
    'bg-blue-300 border border-blue-400 text-black',
  ],
  AMB: [
    'bg-teal-50  border border-teal-200 text-teal-800',
    'bg-teal-100 border border-teal-300 text-teal-800',
    'bg-teal-200 border border-teal-300 text-teal-900',
    'bg-teal-300 border border-teal-400 text-black',
  ],
  WP: [
    'bg-purple-50  border border-purple-200 text-purple-800',
    'bg-purple-100 border border-purple-300 text-purple-800',
    'bg-purple-200 border border-purple-300 text-purple-900',
    'bg-purple-300 border border-purple-400 text-black',
  ],
  CEMS: [
    'bg-orange-50  border border-orange-200 text-orange-800',
    'bg-orange-100 border border-orange-300 text-orange-800',
    'bg-orange-200 border border-orange-300 text-orange-900',
    'bg-orange-300 border border-orange-400 text-black',
  ],
  WT: [
    'bg-cyan-50  border border-cyan-200 text-cyan-800',
    'bg-cyan-100 border border-cyan-300 text-cyan-800',
    'bg-cyan-200 border border-cyan-300 text-cyan-900',
    'bg-cyan-300 border border-cyan-400 text-black',
  ],
  LOG: [
    'bg-gray-50  border border-gray-200 text-gray-700',
    'bg-gray-100 border border-gray-300 text-gray-800',
    'bg-gray-200 border border-gray-300 text-gray-900',
    'bg-gray-300 border border-gray-400 text-black',
  ],
}

/** คืน Tailwind class ของช่องปฏิทินตามทีม + tier ; fallback → slate tier0 */
export function teamCellClass(teamCode: string | null | undefined, tier = 0): string {
  const tiers = TEAM_CELL[teamCode ?? ''] ?? TEAM_CELL.ST
  return tiers[tier % TEAM_TIERS] ?? tiers[0]
}

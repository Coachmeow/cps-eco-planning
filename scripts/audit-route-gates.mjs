// ตรวจว่าทุก API route มี "gate" สิทธิ์ครบไหม
//   gate = requireRole / hasRole / requireCems / requireCemsAdmin ในตัว handler
//   public allowlist = /api/auth/*, /api/public/*, /api/gps/ingest (กันด้วย secret/ตั้งใจเปิด)
// เป้าหลัก: handler ที่ "แก้ข้อมูล" (POST/PUT/PATCH/DELETE) ที่ไม่มี gate → เสี่ยง (exit 1)
//   GET ที่ไม่มี gate = อ่านได้ทุกคนที่ล็อกอิน (รายงานไว้ ไม่ทำให้ fail)
// รัน: node scripts/audit-route-gates.mjs   (หรือ npm run audit:gates)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

const API_DIR = join(process.cwd(), 'app', 'api')
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const GATE_RE = /\b(requireRole|requireCems|requireCemsAdmin|hasRole)\s*\(/
// handler: export [async] function GET(...)  |  export const GET = ...
const HANDLER_RE = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g

// route path จาก file path: .../app/api/foo/[id]/route.ts → /api/foo/[id]
function routeOf(file) {
  const rel = file.split(`app${sep}api`)[1] ?? file
  return '/api' + rel.replace(/route\.ts$/, '').replace(/\\/g, '/').replace(/\/$/, '')
}
function isPublic(route) {
  return route.startsWith('/api/auth/') || route.startsWith('/api/public/') || route === '/api/gps/ingest'
}

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name === 'route.ts') out.push(p)
  }
  return out
}

// แยก handler แต่ละตัว + เนื้อ body (จนถึง handler ถัดไป) แล้วเช็ค gate ใน body นั้น
function handlersOf(src) {
  const hits = []
  let m
  HANDLER_RE.lastIndex = 0
  while ((m = HANDLER_RE.exec(src)) !== null) hits.push({ method: m[1] ?? m[2], start: m.index })
  return hits.map((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].start : src.length
    const body = src.slice(h.start, end)
    return { method: h.method, gated: GATE_RE.test(body) }
  })
}

const files = walk(API_DIR).sort()
const risky = []          // mutating + ungated + ไม่ public
const openReads = []      // GET ungated (ไม่ public) — อ่านได้ทุกคนที่ล็อกอิน
const publicRoutes = new Set()
let handlerCount = 0

for (const file of files) {
  const route = routeOf(file)
  const src = readFileSync(file, 'utf8')
  const handlers = handlersOf(src)
  const pub = isPublic(route)
  if (pub) publicRoutes.add(route)
  for (const h of handlers) {
    handlerCount++
    if (h.gated || pub) continue
    if (MUTATING.has(h.method)) risky.push(`${h.method.padEnd(6)} ${route}`)
    else openReads.push(`${h.method.padEnd(6)} ${route}`)
  }
}

const line = '─'.repeat(60)
console.log(line)
console.log(`ตรวจ route gates — ${files.length} ไฟล์ · ${handlerCount} handler`)
console.log(line)

console.log(`\n⚠  handler ที่แก้ข้อมูลแต่ไม่มี gate (${risky.length}):`)
if (risky.length === 0) console.log('   — ไม่พบ (ทุก POST/PUT/PATCH/DELETE มี gate หรือเป็น public) ✅')
else risky.forEach(r => console.log('   ✗ ' + r))

console.log(`\nℹ  GET ที่ไม่มี gate = อ่านได้ทุกคนที่ล็อกอิน (${openReads.length}) — ปกติถ้าตั้งใจ:`)
openReads.forEach(r => console.log('   · ' + r))

console.log(`\n🔓 public routes (ไม่ต้องล็อกอิน — ตั้งใจเปิด): ${publicRoutes.size}`)
;[...publicRoutes].sort().forEach(r => console.log('   · ' + r))

console.log('\n' + line)
if (risky.length > 0) {
  console.log(`❌ พบ ${risky.length} handler ที่แก้ข้อมูลโดยไม่มี gate — โปรดใส่ requireRole/hasRole/requireCems`)
  process.exit(1)
}
console.log('✅ ผ่าน — ทุก handler ที่แก้ข้อมูลมี gate ครบ')

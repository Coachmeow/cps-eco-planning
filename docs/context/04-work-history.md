# บันทึกแผนงานและเหตุผลเบื้องหลัง (เรียงจากใหม่ไปเก่า)

> ไฟล์นี้คือบันทึกการวางแผนงานที่ทำร่วมกับ AI ผู้ช่วย เก็บไว้เพื่อให้เข้าใจว่า
> **"ทำไมโค้ดถึงเป็นแบบนี้"** ไม่ใช่แค่ "โค้ดทำอะไร" — ซึ่งอ่านจากตัวโค้ดเอาเองได้อยู่แล้ว
> งานทุกหัวข้อในไฟล์นี้ทำเสร็จและขึ้นระบบจริงแล้ว

---

# งานที่ทำ — ปรับ UI Dashboard · Sidebar · CEMS · ฟอนต์ทั้งแอป (รอบล่าสุด)

## สรุปสิ่งที่เปลี่ยน (งาน UI ล้วน ไม่แตะ business logic)
- **ฟอนต์ทั้งแอป → IBM Plex Sans Thai** (`app/layout.tsx` + `globals.css`): เดิมใช้ Geist ที่โหลด subset `latin` เท่านั้น ตัวไทยจึงตกไปใช้ฟอนต์ระบบ (เพี้ยนต่างเครื่อง) — เปลี่ยนเป็น IBM Plex Sans Thai (subset thai+latin) คุมหน้าตาให้เหมือนกันทุกเครื่อง. หมายเหตุ: ฟอนต์ **PDF** ยังเป็น Sarabun แยกต่างหาก (คนละส่วน)
- **การ์ด "สัดส่วนกำลังคน (Capacity donut)" ถูกยุบ → วงแหวน utilization 5 ทีม** (`components/dashboard/charts/CapacityRings.tsx` ใหม่ · ลบ `CapacityDonut.tsx`): ฝังในแผงซ้ายของการ์ด Sankey แทนเลข "Man-day รวม" เดิม. แสดง `722 / 1025 (ใช้ไป NN%)` + วงแหวน 5 ทีม (CEMS·Water·Stack·Workplace·Ambient) จัดแบบลูกเต๋าเลข 5 (1 กลาง 4 มุม). แต่ละวง: ชื่อทีมโค้งบน · % กลาง · "ใช้ of capacity" โค้งล่างรูป U · badge หัวเส้น (≤100% = สีทีมเข้ม `-เหลือ` / เกิน 100% = แดง `+เกิน`). ดึงข้อมูลจาก `teamCapacity[]` ที่มีอยู่แล้ว (ไม่แก้ API)
  > **สำคัญ — ทำไมเลขวงแหวนต่างจาก Sankey:** วงแหวน `booked` = วัน-คนที่คน "สังกัดทีมนั้น" (primaryTeam) ถูกจองไปทำงานทุกประเภท (วัด utilization ของกำลังคน) ส่วน Sankey นับตาม "หมวดงาน" (serviceType) ที่ทำโดยใครก็ได้ — คนละฐาน ต่างกันได้เพราะงานข้ามทีม (ถูกต้องทั้งคู่)
- **ManDaySankey ปรับใหม่** (`components/dashboard/charts/ManDaySankey.tsx`): รับ prop `title` + `leftPanel` — header row = หัวข้อ+ปุ่มไซต์/breadcrumb/hint/dropdown อยู่แถวเดียวกัน ; ใช้ **ResizeObserver วัดขนาดกล่องจริง** แล้ว d3-sankey layout เต็มพื้นที่ (1:1 ไม่ letterbox) — กลุ่มงานกระจายเต็มแนวตั้ง (ST ชิดบน · LOG ชิดล่างเสมอขอบวงแหวน) · margin คุมด้วยค่าคงที่ ML/MR/MT/MB
- **จัดเรียงการ์ด Dashboard ใหม่** (`components/dashboard/DashboardView.tsx`): ProvinceMap → Cross-team → Sankey+วง → KPI 4 การ์ด → แถว 3 กล่องเท่ากัน (ภาระงาน·Capacity คงเหลือ·แนวโน้ม 6 เดือน) → Utilization รายคน (ซ้าย เลื่อนแนวข้าง) + Man-days รายไซต์ (ขวา คงกว้าง เลื่อนแนวตั้ง สูงเท่ากันด้วย absolute fill) → Own vs Rental (แทนตำแหน่ง Man-days เดิม) · กล่องออฟฟิศ (สภาพอากาศ/รถพร้อมใช้งาน/ประจำออฟฟิศ) เปลี่ยนชื่อ + มี date picker แยกอิสระต่อกล่อง
- **ซ่อนแถบ scroll ทั้งแอป โชว์เมื่อชี้เมาส์** (`globals.css` — rule `*`): เหมือนกล่องรถพร้อมใช้งาน
- **weather API ทนขึ้น** (`app/api/dashboard/weather/route.ts`): เพิ่ม timeout 8s + retry 1 ครั้ง กัน cold start/แฮงค์บน Railway (Open-Meteo)
- **CEMS Analyzer** (`components/cems/AnalyzerSection.tsx`): เพิ่มคอลัมน์ **Serial No.** (ถัดจากยี่ห้อ·รุ่น) + เรียง default ตาม `statusUpdatedAt` ล่าสุดขึ้นบนสุด
- **Sidebar** (`components/Sidebar.tsx`): หัวข้อกลุ่ม (ภาพรวม/วางแผน/บริการ/ตั้งค่า) อ่านง่ายขึ้น (13px เข้มขึ้น + เส้นคั่น เลิก uppercase/tracking กว้าง) + ขยายคำว่า "Eco Planning" เป็น text-base

## แนวทางที่ยึด
- งาน UI ใหญ่ทำ Mockup (เครื่องมือ visualize) ให้ดูก่อนทุกครั้ง แล้วรอผู้ใช้อนุมัติ ("push") ค่อยปล่อย
- ไอคอนใช้ lucide-react (ห้าม import lucide `Map`) · ตรวจ `npx tsc --noEmit` ผ่านก่อน commit เสมอ

---

# งานที่ทำ — เตือนการจองซ้อนในรายการ "เครื่องมือร่วม" (แผนเครื่องมือ)

## Context
ในหน้าแผนเครื่องมือ เมื่อเลือกช่วงวัน (เช่น E13-1288 วันที่ 15–18 ก.ค.) แล้วเปิดรายการ "เครื่องมือร่วม" ชิปเครื่องทุกตัวหน้าตาเหมือนกันหมด — เครื่องที่มีงานอยู่แล้วในช่วงนั้น (1289, 1290 ติดงาน STS ตั้งแต่ 17) ก็กดเลือกได้โดยไม่มีสัญญาณเตือน ทำให้เผลอสร้างงานซ้อนโดยไม่รู้ตัว (ไปเห็นเป็น conflict สีแดงในปฏิทินทีหลัง)

ปัจจุบัน popup เช็คเฉพาะ **ส่งซ่อม/Cal** (`/api/equipment-assignments/maintenance` → ตัวที่ `blocked` ถูกกรองออกจากรายการ) แต่**ไม่เช็คการจองซ้อน**เลย

## ข้อเท็จจริงจากโค้ด (สำรวจแล้ว)
- **มี API พร้อมใช้อยู่แล้ว**: `app/api/equipment-assignments/busy/route.ts` — `GET ?start=&days=` คืน `{equipmentId, assignedDate, siteCode, siteColor}` ของงานที่ทับช่วง (คอมเมนต์ในไฟล์ระบุว่าทำไว้เตือนตอนแนบเครื่องในแผนคน)
- **มี UI pattern พร้อมลอก**: `components/staff-calendar/AssignmentPopup.tsx:88–113` (fetch + `busyEq` Map + `busyTitle()`) และ `:699–723` (ชิป: `busy` → กรอบ/พื้น amber + จุดสีไซต์ `siteDotClass(busy[0].siteColor)` + tooltip, ยังกดได้ ; `blocked` เท่านั้นที่ disabled)
- `siteDotClass()` เป็น util ร่วมอยู่แล้วที่ `lib/siteColors.ts` — `EquipmentPopup.tsx:26–31` มี `SITE_DOT` ซ้ำซ้อนอยู่ ใช้ของกลางแทนได้
- ปรัชญาเดิมของระบบคือ **เตือน ไม่บล็อก** (ปุ่ม "จองเพิ่ม (ซ้อนวัน)" ตั้งใจให้ซ้อนได้ + ปฏิทินมี conflict สีแดง) → คงแนวเดิม ให้เตือนแต่ยังกดได้

## สิ่งที่จะทำ
### 1. `lib/equipmentBusy.ts` (ไฟล์ใหม่ เล็ก)
ย้าย `BusyRow` type + `busyTitle(rows)` (ข้อความ `ถูกจองแล้ว: STS (17 ก.ค., 18 ก.ค.)`) ออกมาเป็นของกลาง — กันสองหน้าจอเขียนคนละแบบแล้ว drift

### 2. `components/equipment-calendar/EquipmentPopup.tsx` (หลัก)
- fetch `/api/equipment-assignments/busy?start={date}&days={days}` ใน `useEffect` เกาะ `[date, days]` แบบเดียวกับ maintenance fetch เดิม (บรรทัด 91–99) → เก็บเป็น `busyByEq: Map<number, BusyRow[]>`
- **ชิปเครื่องมือร่วม** (บรรทัด 412–427): เครื่องที่ busy และยังไม่ถูกเลือก → กรอบ/พื้น amber + จุดสีไซต์ + `title` บอกไซต์และวันที่ชน ; ที่เลือกแล้วคงสีเข้มเดิมแต่เติมสัญลักษณ์ ⚠ ให้เห็นว่าเลือกทั้งที่ชน
- **สรุปเหนือปุ่มบันทึก**: ถ้าในรายการที่เลือกมีตัวที่ชน → แถบ amber `⚠ เครื่องที่เลือก N เครื่อง มีงานซ้อนในช่วงนี้` + ชื่อเครื่อง เพื่อให้เห็นแม้พับกลุ่มไว้หรือกด "เลือกทั้งหมด"
- เปลี่ยนไปใช้ `siteDotClass` จาก `lib/siteColors.ts` แล้วลบ `SITE_DOT` ที่ซ้ำ
- **ไม่บล็อกการบันทึก** — ผู้ใช้ยังกดจองซ้อนได้ถ้าตั้งใจ (เหมือนแผนพนักงาน)

### 3. `components/staff-calendar/AssignmentPopup.tsx` (แก้เล็ก)
เปลี่ยนมา import `BusyRow`/`busyTitle` จาก `lib/equipmentBusy.ts` แทนของ local

## Verify
- `npx tsc --noEmit` + `npx next build`
- บนเว็บจริง: เปิดแผนเครื่องมือ ก.ค. 2569 → เลือก E13-1288 วันที่ 15 ถึง 18 → ในเครื่องมือร่วม 1289/1290 ต้องขึ้นสีเหลือง + จุดสีไซต์ + hover เห็น `ถูกจองแล้ว: STS (...)` ; เลือกแล้วต้องมีแถบสรุปเตือนเหนือปุ่มบันทึก ; เครื่องที่ว่างจริงยังเป็นสีปกติ ; กดบันทึกได้ตามปกติ
- เช็คว่าแผนพนักงาน (แนบเครื่องในงาน) ยังเตือนเหมือนเดิมหลัง refactor helper

---

# งานก่อนหน้า — ตัด dropdown ย้ายประเภทในแถว (กันมือลั่น)

## Context
dropdown ประเภทในแถวตารางเครื่องมือ (AdminView.tsx:768–771, `changeType` เรียก `putEquipment` ทันทีที่เลือก ไม่มี confirm) เสี่ยงมือลั่นย้ายประเภทโดยไม่ตั้งใจ ผู้ใช้ต้องการให้แก้ประเภทได้จาก**ปุ่มแก้ไขเท่านั้น** — ตรวจแล้ว modal แก้ไขทั้งเครื่องซื้อ (บรรทัด ~837–842, `ownedForm.typeId`) และเครื่องเช่า (~878–883, `rentalForm.typeId`) มีช่องประเภท + pre-fill จาก `openEdit` อยู่แล้ว จึงตัดได้เลยไม่เสียฟังก์ชัน

## สิ่งที่ทำ (ไฟล์เดียว: `components/admin/AdminView.tsx`)
1. คอลัมน์ประเภท (766–773): เอา `<select>` ออก แสดง `<span>` โค้ดประเภท (แบบเดียวกับสาขา `!canManage`) เสมอ
2. ลบ `changeType` (บรรทัด 682) ที่ไม่ถูกใช้แล้ว (`changeStatus` ยังอยู่ — dropdown สถานะในแถวคงเดิม)

## Verify
`npx tsc --noEmit` + `npx next build` → commit + push (รวม default ซ่อนเครื่องเช่า ที่แก้ไว้แล้วยังไม่ push)

---

# Batch F — แก้ flow ส่ง Cal / รับกลับ / แผน Cal (งานปัจจุบัน)

## Context (ทำไมต้องแก้)
ผู้ใช้เจอ 4 ปัญหาในรอบการส่งสอบเทียบ (Calibration):
1. ตอน "รับเครื่องกลับ" ช่อง "กำหนด Cal ครั้งถัดไป" ปล่อยว่างได้ (`confirmReturn` ส่ง `nextDueDate || null` ไม่มี validation) → บางเครื่องรับกลับแล้วหลุดจากแผน Cal เพราะลืมกรอก ต้องการ**บังคับกรอกตอนรับกลับ Cal**
2. พอรับกลับแล้ว รายการไป "ประวัติ" ซึ่งมีแต่ปุ่ม **ลบ** เท่านั้น (AdminView.tsx:1093) → แก้วันที่ที่กรอกผิด / เติมวันที่ที่ลืม / ดึงออกจากแผนไม่ได้เลย
3. ถามว่า เปิดใบงาน–รับกลับ–กำหนด Cal ถัดไป ควรลิงก์กันไหม (source of truth)
4. บางปีดึงเครื่องมาส่ง Cal ล่วงหน้าก่อนครบ 365 วัน — ต้องทำได้

## ข้อเท็จจริงจากโค้ด (สำรวจแล้ว ไม่ต้องซ้ำ)
- `equipment.calDueDate` ถูก **เขียนที่เดียว** = `app/api/equipment-events/[id]/route.ts` บรรทัด 30 (ตอนรับกลับ Cal) — ที่อื่นอ่านอย่างเดียว (dashboard.ts:227, AdminView CalPlanSection:1178+, EquipmentCard, types). ⇒ **CALIBRATION event เป็น source of truth อยู่แล้ว, calDueDate = cache ที่ derive มา** ไม่มี writer อื่นแย่ง
- `MaintenanceSection` (AdminView.tsx:975–1153): `retForm={returnedDate,nextDueDate,cost}`; `openReturn` (1006) pre-fill `nextDueDate` จาก `ev.nextDueDate` อยู่แล้ว; `confirmReturn` (1010) PATCH ไม่ validate; ประวัติ (1087–1095) มีแต่ปุ่มลบ
- ฟอร์มเปิดใบงานมีช่อง "กำหนด Cal ครั้งถัดไป" (1118–1120, `form.nextDueDate`) = ค่า plan-ahead แบบ optional — ไหลเข้า event.nextDueDate ตอน POST และถูก pre-fill ให้ modal รับกลับ (ดี ไม่ต้องแก้)
- เปิดใบงาน `save()` (1000) เช็คแค่ `equipmentId + sentDate` — **ไม่มี guard 365 วัน** ⇒ ส่ง Cal ล่วงหน้าได้อยู่แล้ว (ข้อ 4 ไม่ต้องแก้โค้ด)
- PATCH route (equipment-events/[id]) รับ expectedDate/nextDueDate/vendor/cost/notes/returnedDate; re-sync calDueDate เฉพาะเมื่อ `body.returnedDate` truthy **และ** nextDue truthy (บรรทัด 27–32) → เคลียร์ค่าไม่ได้ + แก้ event เก่าอาจทับของใหม่

## คำตอบเชิงออกแบบ (ข้อ 3 — linkage)
ให้ **CALIBRATION event เป็น source of truth เดียว**:
- เปิดใบงาน (`sentDate`) → ขับ chip/แถบ "ส่งแคล" ในแผนเครื่องมือ (date-aware 15 วัน — มีแล้ว)
- `event.nextDueDate` → derive `equipment.calDueDate` → ขับหน้า "แผน Cal"
- รับกลับ (`returnedDate`) → เครื่องกลับ ACTIVE + ยืนยัน nextDueDate (บังคับ)
⇒ แก้แผน Cal = แก้ที่ event เสมอ (ในหน้าประวัติซ่อม/Cal) ไม่แก้ calDueDate ตรงๆ เพื่อกันข้อมูลเพี้ยน

## สิ่งที่จะทำ (2 ไฟล์)

### 1. Server — `app/api/equipment-events/[id]/route.ts` (PATCH)
- **บังคับ nextDueDate เฉพาะการรับกลับครั้งแรกของงาน Cal**: ถ้า `!current.returnedDate && body.returnedDate && current.type==='CALIBRATION' && !(body.nextDueDate ?? current.nextDueDate)` → ตอบ 400 `"ต้องระบุกำหนด Cal ครั้งถัดไป"` (การ**แก้ไขงานที่รับกลับแล้ว** อนุญาตให้เคลียร์ได้ = ดึงออกจากแผน)
- **Re-sync calDueDate แบบ recompute-from-events** (แทน logic บรรทัด 27–32): หลัง update event ถ้า `current.type==='CALIBRATION'` → หา Cal event ล่าสุดที่รับกลับแล้วของเครื่องนั้น (`findFirst where {equipmentId,type:'CALIBRATION',returnedDate:{not:null}} orderBy sentDate desc`) แล้วตั้ง `calDueDate = latest?.nextDueDate ?? null` — ครอบคลุมทั้งรับกลับ / แก้วันที่ / เคลียร์ / กันแก้ event เก่าทับของใหม่. คง `status:'ACTIVE'` เมื่อ `body.returnedDate` truthy. ห่อ `$transaction`

### 2. Client — `components/admin/AdminView.tsx` (MaintenanceSection)
- **Modal รับกลับ** (1140): ทำช่อง nextDueDate ให้ required เมื่อ type==='CALIBRATION' — ใส่ `*` แดง + disable ปุ่ม "ยืนยันรับกลับ" และขึ้น hint ถ้าว่าง (`returning.type==='CALIBRATION' && !retForm.nextDueDate`)
- **ประวัติ**: เพิ่มปุ่ม "แก้ไข" ทุกแถว (ก่อนปุ่มลบ, สิทธิ์ `canDelete`) → เปิด modal แก้ไข (state `editing`/`editForm={returnedDate,nextDueDate,cost}`, `confirmEdit` PATCH) — nextDueDate **เคลียร์ได้** (= ดึงออกจากแผน Cal) พร้อมข้อความอธิบาย "เว้นว่าง = นำออกจากแผน Cal"
- ไม่แตะฟอร์มเปิดใบงาน (ช่อง plan-ahead + ไม่มี guard 365 = ตอบข้อ 4 อยู่แล้ว)

## Verify
- `npx tsc --noEmit` + `npx next build`
- บนเว็บจริง: (a) รับกลับงาน Cal โดยไม่กรอกกำหนดถัดไป → กดยืนยันไม่ได้ / ยิง API ตรงได้ 400 ; (b) แก้ไขในประวัติ เปลี่ยนวันกำหนดถัดไป → หน้าแผน Cal ขยับตาม ; (c) เคลียร์วันในประวัติ → เครื่องหายจากแผน Cal ; (d) เปิดใบงาน Cal ก่อนครบ 365 วันได้ปกติ
- ไม่รัน dev ชน DB production ; push master = deploy (ขออนุมัติก่อน)

---

# แผนงานค้าง 5 กลุ่ม — Eco Planning System (จัดลำดับแบบประหยัด Token)

## Context
ผู้ใช้ลิสต์งานค้าง 5 กลุ่ม (จัดระเบียบ role CEMS · UI/PDF แผนเครื่องมือ-รถ · ฟังก์ชันจองให้เท่าแผนพนักงาน · ลบงานแบบผูกโยง · logic จองช่วงส่ง Cal/ซ่อม) ให้วางแผนก่อน ยังไม่ลงมือ และให้จัดลำดับโดยคำนึงถึงการประหยัด token/context

**คำตอบที่เคาะแล้ว:**
- ข้อ 1.1: CEMS User = ดู+บันทึกงานได้ (เบิก/อัปเดตสถานะ/ความดัน) แต่**ห้ามอนุมัติ/ลบ/จัดการทะเบียน-แผน** ; CEMS Admin = ทำได้หมด
- ข้อ 3: เอาครบ — Move ทั้งช่วง + ลบงานแม่ทั้งช่วง + แก้จำนวนวัน/รายละเอียด

**ข้อเท็จจริงจากการสำรวจ (ไม่ต้องสำรวจซ้ำตอนทำ):**
- ข้อ 4: `EquipmentAssignment.staffAssignmentId` และ `VehicleBooking.staffAssignmentId` มีอยู่แล้ว ; `app/api/staff-assignments/[id]/route.ts` DELETE ตอนนี้ **set null** (ตัดสายผูก) แทนที่จะลบ
- ข้อ 5: logic วันที่มีแล้วใน `lib/equipmentAvailability.ts` (`maintStateForWindow`, ใช้อยู่ใน `app/api/staff-assignments/route.ts` + `app/api/equipment-assignments/maintenance/route.ts`) แต่ `components/equipment-calendar/EquipmentPopup.tsx` ยังใช้ `equipment.status === 'ACTIVE'` (บรรทัด ~66, 219) = ล็อคทั้งเครื่องแบบเก่า
- ข้อ 3: ต้นแบบ move อยู่ที่ `app/api/staff-assignments/move/route.ts` + UI ใน `components/staff-calendar/AssignmentPopup.tsx`
- ข้อ 2.2: ต้นแบบ PDF อยู่ที่ `lib/pdf/staffPdf.ts` (สีทีม tier2, merge หลายวัน, หน้า "หมายเหตุงาน" + เครื่องหมาย `*`)
- สิทธิ์ CEMS ปัจจุบัน: `User.cemsAccess Boolean` + `requireCems()` ใน `lib/auth.ts` — ทุก route ใน `app/api/cems/**` ใช้ตัวเดียวกันหมด ไม่แยกระดับ

---

## ลำดับการทำ (Batch A→E) — เหตุผล: เล็กก่อน, จัดกลุ่มตามไฟล์เดียวกันเพื่อไม่อ่านซ้ำ, งาน schema/สิทธิ์แยกท้ายสุด

### Batch A — ข้อ 4: ลบงานพนักงานแล้วลบเครื่อง/รถที่จองพ่วงไปด้วย (เล็กสุด ~1 ไฟล์)
- `app/api/staff-assignments/[id]/route.ts` (DELETE, สาขา parent):
  - รวม id งานแม่+ลูก → หา `equipmentAssignment`/`vehicleBooking` ที่ `staffAssignmentId` อยู่ในชุดนั้น
  - ลบลูกของ booking เหล่านั้น (`parentId in ids`) ก่อน แล้วลบตัว booking — แทนการ set null เดิม
  - booking ที่จองแยก (staffAssignmentId = null) ไม่แตะ = พฤติกรรมเดิม
- ทำใน `$transaction`

### Batch B — ข้อ 5 + 2.1: แผนเครื่องมือ logic วันที่ + UI contrast (ไฟล์กลุ่ม equipment/vehicle-calendar ชุดเดียวกัน)
- **ข้อ 5 (logic):**
  - `EquipmentPopup.tsx`: เลิกใช้ `status === 'ACTIVE'` → ใช้ endpoint availability ที่มีอยู่ (`/api/equipment-assignments/maintenance` ที่ใช้ `maintStateForWindow`) ตามช่วงวันที่เลือก: `blocked` = ห้ามจอง (ทับช่วงซ่อม/Cal), `tentative` = จองได้ + แถบเตือน "จองหลังกำหนดรับกลับ ยังไม่ยืนยันรับเครื่อง" (เหมือนฝั่งแผนพนักงาน)
  - Guard ฝั่ง API: `app/api/equipment-assignments/route.ts` POST เพิ่มเช็ค `maintStateForWindow` แบบเดียวกับ `staff-assignments` POST (กันยิงตรง)
  - **โชว์ช่วงซ่อม/Cal ในตาราง**: `EquipmentCalendar.tsx` โหลด event ซ่อม/Cal ที่ยังไม่คืน → `EquipmentCell.tsx` แสดงแถบ "ส่งซ่อม"/"ส่งแคล" (โทนเหลือง/แดงจาง) ครอบช่วงวันที่เครื่องไม่อยู่
- **ข้อ 2.1 (UI):** ปรับ `EquipmentCalendar/EquipmentCell` และ `VehicleCalendar/VehicleCell` ให้เหมือนแผนพนักงาน: เส้นแบ่งแถวแนวนอน `slate-400`, ตัวหนังสือ `font-medium text-xs`, หัวตาราง/วันอาทิตย์-วันหยุดโทนเดียวกับ `StaffCalendar.tsx` (สีช่อง tier2 ใช้แล้ว)

### Batch C — ข้อ 3: ฟังก์ชันจองเครื่องมือ/รถ เท่าแผนพนักงาน (ใหญ่สุดของฝั่ง UI)
- API ใหม่ 2 ชุด ตามแพทเทิร์น `staff-assignments/move/route.ts`:
  - `app/api/equipment-assignments/move/route.ts` (GET preview + POST move — เช็คชน + เช็ค maint window ปลายทาง)
  - `app/api/vehicle-bookings/move/route.ts`
- ลบงานแม่ทั้งช่วง: ตรวจ `equipment-assignments/[id]` + `vehicle-bookings/[id]` DELETE ว่าลบลูกตามแม่ครบหรือยัง — ถ้ายัง เพิ่มแบบเดียวกับ staff
- Popup (`EquipmentPopup.tsx`, `VehiclePopup.tsx`): เพิ่ม "เลื่อนงาน" (เลือกวันเริ่มใหม่ + preview ชน), "ลบทั้งช่วง", แก้จำนวนวัน/ไซต์/หมายเหตุของงานที่มีอยู่ — เลียนแบบเฉพาะ 3 ฟังก์ชันนี้จาก `AssignmentPopup.tsx`

### Batch D — ข้อ 2.2: Export PDF แผนเครื่องมือ + แผนรถ (isolated ทำจาก template เดิม)
- สร้าง `lib/pdf/equipmentPdf.ts` + `lib/pdf/vehiclePdf.ts` โดย **แตก helper ร่วมจาก `staffPdf.ts`** (ฟอนต์ Sarabun, สีทีม, buildDayCell แบบ generic, หน้า "หมายเหตุ" + เครื่องหมาย `*`)
- แถว = เครื่องมือ (ประเภท·หมายเลข) / รถ (ทะเบียน·ชื่อ) ; ช่อง = ไซต์ + สีทีมผู้ใช้ ; ช่วงซ่อม/Cal โชว์ในช่องด้วย (ต่อยอดจาก Batch B)
- ปุ่ม Export ใน `EquipmentCalendar.tsx` / `VehicleCalendar.tsx` (client-side เหมือน staff)

### Batch E — ข้อ 1.1: แยก CEMS User / CEMS Admin (schema + สิทธิ์ — ท้ายสุด แยก review)
- Schema: เพิ่ม `enum CemsRole { NONE USER ADMIN }` + `User.cemsRole CemsRole @default(NONE)` — **คง `cemsAccess` ไว้ชั่วคราว** ; bootstrap: `cemsAccess=true → cemsRole=USER` (system ADMIN = CEMS Admin เสมอ)
- `lib/auth.ts`: `requireCems()` = USER ขึ้นไป (เดิม) + เพิ่ม `requireCemsAdmin()`
- **CEMS Admin เท่านั้น**:
  - อนุมัติ/ปฏิเสธคำขอเบิก (`cems/part-requests/[id]` PATCH)
  - DELETE ทุกตัวใน `app/api/cems/**` (analyzers, events, parts, txns, schedules, sites, gas)
  - จัดการทะเบียน/แผน: parts POST/PATCH/import, part-schedules ทั้งชุด, sites POST/PATCH, analyzers POST/PUT, gas POST/PATCH/DELETE
  - เบิก/รับเข้าตรง (part-txns POST = ตัดสต็อกไม่ผ่านอนุมัติ)
- **CEMS User ทำได้**: GET ทุกหน้า, สร้างคำขอเบิก (part-requests POST), บันทึก analyzer-events POST (ย้าย/ซ่อม/PM), บันทึกความดันแก๊ส (gas readings POST + แจ้งหมด/แจ้งส่งคืน)
- UI: หน้า ผู้ใช้งาน เปลี่ยน checkbox CEMS → dropdown (ไม่มีสิทธิ์ / CEMS User / CEMS Admin) ; ใน CEMS ซ่อนปุ่มอนุมัติ/ลบ/จัดการ สำหรับ USER (`useMe` ส่ง cemsRole)
- หน้า QR สาธารณะไม่กระทบ (PIN เดิม)

---

## กลยุทธ์ประหยัด Token
1. ทำทีละ Batch — แต่ละ batch ไฟล์กลุ่มเดียวกัน อ่านครั้งเดียวแก้หลายเรื่อง (B รวมข้อ 5+2.1)
2. ใช้ pattern/util ที่มีอยู่ (move route, maintStateForWindow, staffPdf, teamCellClass) — ไม่เขียนใหม่
3. อ่านแบบเจาะจง (grep + offset/limit) ไม่อ่านไฟล์ใหญ่ซ้ำ ; ข้อเท็จจริงที่สำรวจแล้วบันทึกในแผนนี้แล้ว
4. Verify ครั้งเดียวต่อ batch: `npx tsc --noEmit` + `npx next build` → commit → push — ไม่ build ถี่ระหว่างแก้
5. Batch C/D เป็นงานกลไกตาม pattern ชัด → เหมาะมอบให้ **scheduled task (Sonnet)** แบบที่เคยทำ CEMS Phase B สำเร็จ แล้ว Opus รีวิวท้าย (ประหยัด token รุ่นใหญ่) — ตัดสินใจตอนเริ่มแต่ละ batch
6. Batch E แตะ security → ทำใน session context สด รีวิวเอง ไม่มอบหมาย

## Verification (ต่อ batch)
- ทุก batch: `npx tsc --noEmit` + `npx next build` ผ่านก่อน commit ; ห้ามรัน dev ชน DB production
- A: บนเว็บจริง — สร้างงาน+พ่วงรถ/เครื่อง → ลบงาน → เครื่อง/รถหายตาม ; จองแยกยังอยู่
- B: เครื่องส่ง Cal มีกำหนดรับกลับ → จองในเมนูแผนเครื่องได้เฉพาะนอกช่วง + เตือน tentative ; ตารางโชว์แถบส่งซ่อม/แคล
- C: เลื่อน/ลบทั้งช่วง/แก้วัน จาก popup เครื่องมือและรถ → ตารางอัปเดตถูก
- D: Export PDF เครื่องมือ+รถ — สี/merge/หน้าหมายเหตุครบ
- E: ทดสอบ 2 บัญชี (USER vs ADMIN) — USER อนุมัติ/ลบไม่ได้ทั้งจาก UI และยิง API ตรง (403)

## To-do list ที่จะสร้างหลังอนุมัติแผน (TaskCreate)
- #A ข้อ4: ลบงานพนักงาน → ลบเครื่อง/รถที่พ่วง
- #B ข้อ5+2.1: แผนเครื่องมือ date-aware + แถบซ่อม/Cal + contrast เครื่องมือ/รถ
- #C ข้อ3: Move/ลบทั้งช่วง/แก้งาน สำหรับเครื่องมือ+รถ (API+popup)
- #D ข้อ2.2: PDF แผนเครื่องมือ + แผนรถ (+หน้าหมายเหตุ)
- #E ข้อ1.1: CEMS User/Admin (schema+auth+gating+UI users)

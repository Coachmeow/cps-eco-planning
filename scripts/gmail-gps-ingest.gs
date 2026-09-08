/**
 * Cartrack Daily GPS → ส่งเข้าระบบ CPS Eco Planning อัตโนมัติ
 * ────────────────────────────────────────────────────────────
 * วิธีใช้ (ทำในบัญชี Gmail ที่รับเมล Cartrack = dew.anuwatk@gmail.com):
 *  1) เปิด https://script.google.com → New project → วางโค้ดนี้ทั้งหมด
 *  2) แก้ค่า CONFIG ด้านล่าง (ENDPOINT + SECRET + ปรับ SEARCH ให้ตรงเมล Cartrack)
 *  3) เมนู Run → เลือกฟังก์ชัน importGpsDaily แล้วกด Run ครั้งแรก (อนุญาตสิทธิ์ Gmail)
 *  4) ตั้ง Trigger รายวัน: ไอคอนนาฬิกา (Triggers) → Add Trigger
 *     - Function: importGpsDaily · Event: Time-driven · Day timer · เลือกช่วงเวลา (เช่น 6–7am)
 */

// ─── CONFIG ───────────────────────────────────────────────
var ENDPOINT = 'https://YOUR-APP.up.railway.app/api/gps/ingest'; // ★ URL ระบบ + /api/gps/ingest
var SECRET   = 'PASTE-SAME-SECRET-AS-RAILWAY';                    // ★ ต้องตรงกับ env GPS_INGEST_SECRET ใน Railway
// ค้นเมล Cartrack ที่มีไฟล์แนบ .xls — ปรับ from:/subject: ให้แคบลงตามเมลจริง (แนะนำ)
var SEARCH   = 'has:attachment filename:xls newer_than:10d';     // เช่น 'from:noreply@cartrack.com has:attachment filename:xls newer_than:10d'
var LABEL    = 'GPS-Imported';                                    // ป้ายกันส่งซ้ำ
var NAME_RE  = /\.xlsx?$/i;                                       // ชื่อไฟล์ที่รับ (.xls/.xlsx)
// ──────────────────────────────────────────────────────────

function importGpsDaily() {
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var threads = GmailApp.search(SEARCH + ' -label:' + LABEL, 0, 50);
  var ok = 0, fail = 0;

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var msgs = thread.getMessages();
    var anySent = false, allOk = true;

    for (var m = 0; m < msgs.length; m++) {
      var atts = msgs[m].getAttachments();
      for (var a = 0; a < atts.length; a++) {
        var att = atts[a];
        if (!NAME_RE.test(att.getName())) continue;
        anySent = true;
        try {
          var res = UrlFetchApp.fetch(ENDPOINT, {
            method: 'post',
            headers: { 'x-ingest-secret': SECRET },
            payload: { file: att.copyBlob().setName(att.getName()), name: att.getName() },
            muteHttpExceptions: true,
          });
          var code = res.getResponseCode();
          if (code >= 200 && code < 300) { ok++; Logger.log('OK ' + att.getName() + ' → ' + res.getContentText()); }
          else { fail++; allOk = false; Logger.log('FAIL ' + code + ' ' + att.getName() + ' → ' + res.getContentText()); }
        } catch (e) {
          fail++; allOk = false; Logger.log('ERROR ' + att.getName() + ' → ' + e);
        }
      }
    }
    // ติดป้าย "ประมวลผลแล้ว" เฉพาะ thread ที่ส่งไฟล์สำเร็จครบ (จะได้ไม่ส่งซ้ำ / แต่ถ้าพลาดจะลองใหม่วันหน้า)
    if (anySent && allOk) thread.addLabel(label);
  }
  Logger.log('เสร็จ: สำเร็จ ' + ok + ' ไฟล์, ล้มเหลว ' + fail + ' ไฟล์');
}

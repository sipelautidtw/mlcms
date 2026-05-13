// server/index.js — JARVIS Backend Server
const express = require("express");
const cors    = require("cors");
const https   = require("https");
const db      = require("./db");
const sheets  = require("./sheets");

const app  = express();
const PORT = 3001;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const ok   = (res, data)       => res.json({ success: true,  data });
const fail = (res, msg, code=400) => res.status(code).json({ success: false, message: msg });

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => ok(res, { status: "online", time: new Date().toISOString() }));

// ─── SHEETS ───────────────────────────────────────────────────────────────────

// Test koneksi Sheets
app.get("/api/sheets/test", async (req, res) => {
  try {
    const info = await sheets.getInfo();
    ok(res, { connected: true, title: info.properties.title, tabs: info.sheets.map(s => s.properties.title) });
  } catch(e) { fail(res, `Koneksi gagal: ${e.message}`, 500); }
});

// Preview struktur Sheets (header + 1 baris sample per tab)
app.get("/api/sheets/preview", async (req, res) => {
  try {
    const info   = await sheets.getInfo();
    const tabs   = info.sheets.map(s => s.properties.title);
    const result = {};
    for (const tab of tabs) {
      try {
        const raw = await sheets.readSheet(tab, "A1:Z3");
        result[tab] = { headers: raw[0]||[], sample: raw[1]||[] };
      } catch(e) { result[tab] = { error: e.message }; }
    }
    ok(res, result);
  } catch(e) { fail(res, e.message, 500); }
});

// Baca isi tab (untuk debug)
app.get("/api/sheets/read/:tab", async (req, res) => {
  try {
    const tab  = decodeURIComponent(req.params.tab);
    const rows = parseInt(req.query.rows)||10;
    const raw  = await sheets.readSheet(tab, `A1:Z${rows}`);
    ok(res, { tab, rows: raw });
  } catch(e) { fail(res, e.message, 500); }
});

// Sync satu tab dari Sheets ke DB
app.post("/api/sheets/sync/:tab", async (req, res) => {
  try {
    const tab   = decodeURIComponent(req.params.tab);
    const count = await sheets.syncTab(tab);
    ok(res, { tab, count, message: `${tab}: ${count} baris berhasil disync` });
  } catch(e) { fail(res, e.message, 500); }
});

// Sync semua tab sekaligus
app.post("/api/sheets/sync-all", async (req, res) => {
  try {
    const results = await sheets.syncAll();
    const total   = Object.values(results).reduce((s,r) => s + (r.count||0), 0);
    ok(res, { results, total, message: `Sync selesai — total ${total} baris` });
  } catch(e) { fail(res, e.message, 500); }
});

// Export dari DB ke Sheets
app.post("/api/sheets/export/:tab", async (req, res) => {
  try {
    const tab   = decodeURIComponent(req.params.tab);
    const count = await sheets.exportTab(tab);
    ok(res, { tab, count, message: `${tab}: ${count} baris berhasil diekspor` });
  } catch(e) { fail(res, e.message, 500); }
});

// ─── DATA READ (untuk AI & dashboard) ─────────────────────────────────────────

// Ringkasan semua data untuk dashboard
app.get("/api/summary", (req, res) => {
  try {
    const bulan = req.query.bulan || String(new Date().getMonth()+1).padStart(2,"0");
    const tahun = req.query.tahun || String(new Date().getFullYear());

    // Hitung hari tersisa compliance
    db.prepare("UPDATE compliance SET hari_tersisa = CAST((julianday(tgl_expired) - julianday('now')) AS INTEGER) WHERE tgl_expired != ''").run();

    const counts = {
      manpower:    db.prepare("SELECT COUNT(*) as c FROM manpower WHERE strftime('%m',tanggal)=? AND strftime('%Y',tanggal)=?").get(bulan.padStart(2,"0"),tahun).c,
      pic_equipment: db.prepare("SELECT COUNT(*) as c FROM pic_equipment").get().c,
      schedule_pm: db.prepare("SELECT COUNT(*) as c FROM schedule_pm").get().c,
      stok_material: db.prepare("SELECT COUNT(*) as c FROM stok_material").get().c,
      work_order:  db.prepare("SELECT COUNT(*) as c FROM work_order").get().c,
      budget:      db.prepare("SELECT COUNT(*) as c FROM budget").get().c,
      vendor:      db.prepare("SELECT COUNT(*) as c FROM vendor").get().c,
      compliance:  db.prepare("SELECT COUNT(*) as c FROM compliance").get().c,
      utility:     db.prepare("SELECT COUNT(*) as c FROM utility_meter").get().c,
    };

    const wo_status   = db.prepare("SELECT status, COUNT(*) as c FROM work_order GROUP BY status").all();
    const pm_status   = db.prepare("SELECT status, COUNT(*) as c FROM schedule_pm GROUP BY status").all();
    const stok_kritis = db.prepare("SELECT nama, stok_aktual, stok_minimum, satuan FROM stok_material WHERE stok_aktual <= stok_minimum ORDER BY stok_aktual ASC LIMIT 10").all();
    const doc_expiring= db.prepare("SELECT nama, jenis, tgl_expired, hari_tersisa FROM compliance WHERE hari_tersisa IS NOT NULL AND hari_tersisa <= 90 ORDER BY hari_tersisa ASC LIMIT 10").all();
    const budget_data = db.prepare("SELECT * FROM budget WHERE tahun=?").all(tahun);
    const sync_status = db.prepare("SELECT tab, synced_at, row_count, status FROM sync_log GROUP BY tab HAVING MAX(id) ORDER BY tab").all();

    ok(res, { counts, wo_status, pm_status, stok_kritis, doc_expiring, budget_data, sync_status, bulan, tahun });
  } catch(e) { fail(res, e.message, 500); }
});

// Query data spesifik berdasarkan pertanyaan CE
app.post("/api/query", (req, res) => {
  try {
    const { message } = req.body;
    const msg = (message||"").toLowerCase();
    const result = {};

    const BM = {januari:"01",februari:"02",maret:"03",april:"04",mei:"05",juni:"06",juli:"07",agustus:"08",september:"09",oktober:"10",november:"11",desember:"12"};
    const currBulan = String(new Date().getMonth()+1).padStart(2,"0");
    const currTahun = String(new Date().getFullYear());

    // Deteksi bulan & tahun dari pesan
    const bmMatch = msg.match(/januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i);
    const thnMatch = msg.match(/20\d\d/);
    const bulan = bmMatch ? BM[bmMatch[0].toLowerCase()] : currBulan;
    const tahun = thnMatch ? thnMatch[0] : currTahun;

    // Deteksi tanggal spesifik
    const tglMatch = msg.match(/(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s*(\d{4})?/i);
    if (tglMatch) {
      const tgl     = String(parseInt(tglMatch[1])).padStart(2,"0");
      const bln     = BM[tglMatch[2].toLowerCase()];
      const thn     = tglMatch[3] || currTahun;
      const tanggal = `${thn}-${bln}-${tgl}`;
      const rows    = db.prepare("SELECT nama, jabatan, shift, hari FROM manpower WHERE tanggal=? ORDER BY jabatan, nama").all(tanggal);
      if (rows.length) result.manpower_tanggal = { tanggal, rows };
    }

    // Manpower bulan — deteksi lebih luas termasuk nama orang
    const manpowerKeywords = ["manpower","jadwal","shift","libur","hadir","masuk","masuk kerja","bekerja","bertugas","hari yang sama","shift yang sama","bersama","kapan","terdekat","tanggal berapa"];
    const hasManpowerQuery = manpowerKeywords.some(k => msg.includes(k));

    // Deteksi nama teknisi disebut dalam pesan (case-insensitive)
    let namaDisebut = [];
    let namaAsli    = []; // nama asli di database (huruf besar)
    try {
      const semuaNama = db.prepare("SELECT DISTINCT nama FROM manpower").all();
      semuaNama.forEach(r => {
        const namaLower = r.nama.toLowerCase();
        // Cek nama penuh atau sebagian nama (min 3 karakter)
        const bagianNama = namaLower.split(/\s+/).filter(w => w.length >= 3);
        const cocok = namaLower === msg.trim() ||
                      msg.includes(namaLower) ||
                      bagianNama.some(b => msg.includes(b));
        if (cocok) {
          namaDisebut.push(namaLower);
          namaAsli.push(r.nama);
        }
      });
    } catch(e) {}

    if (hasManpowerQuery || namaAsli.length > 0) {
      const rows = db.prepare("SELECT nama, jabatan, tanggal, hari, shift FROM manpower WHERE strftime('%m',tanggal)=? AND strftime('%Y',tanggal)=? ORDER BY tanggal, nama").all(bulan, tahun);
      if (rows.length) result.manpower = { bulan, tahun, total: rows.length, rows };
    }

    // Khusus: cari hari dimana dua atau lebih nama berada di shift yang sama
    if (namaAsli.length >= 2 && (msg.includes("sama") || msg.includes("bersama") || msg.includes("terdekat") || msg.includes("kapan") || msg.includes("tanggal berapa"))) {
      try {
        const rows = db.prepare("SELECT nama, jabatan, tanggal, hari, shift FROM manpower WHERE strftime('%m',tanggal)=? AND strftime('%Y',tanggal)=? ORDER BY tanggal, nama").all(bulan, tahun);
        const byDate = {};
        rows.forEach(r => { if (!byDate[r.tanggal]) byDate[r.tanggal]=[]; byDate[r.tanggal].push(r); });
        const matches = [];
        Object.entries(byDate).forEach(([tgl, arr]) => {
          const relevant = arr.filter(r => namaAsli.includes(r.nama) && r.shift && r.shift !== "OFF");
          if (relevant.length === namaAsli.length) {
            const shifts = [...new Set(relevant.map(r => r.shift))];
            if (shifts.length === 1) {
              matches.push({ tanggal: tgl, hari: arr[0]?.hari, shift: shifts[0], teknisi: relevant });
            }
          }
        });
        result.shift_sama = { nama_dicari: namaAsli, matches };
      } catch(e) {}
    }

    // PIC Equipment — cari nama spesifik dari pesan
    try {
      const allPic = db.prepare("SELECT * FROM pic_equipment ORDER BY divisi, nama").all();
      // Cari equipment yang namanya disebut
      const matched = allPic.filter(e => {
        const nm = (e.nama||"").toLowerCase();
        const kd = (e.kode||"").toLowerCase();
        return nm.split(/\s+/).filter(w=>w.length>2).some(w=>msg.includes(w)) || (kd && msg.includes(kd));
      });
      if (matched.length) {
        result.pic_equipment = matched;
      } else if (msg.includes("pic")||msg.includes("equipment")||msg.includes("handle")||msg.includes("menangani")||msg.includes("peralatan")||msg.includes("bertanggung")) {
        result.pic_equipment = allPic;
      }
    } catch(e) {}

    // Schedule PM
    if (msg.includes("schedule")||msg.includes(" pm")||msg.includes("preventive")||msg.includes("maintenance")) {
      const rows = db.prepare("SELECT * FROM schedule_pm ORDER BY tanggal_plan").all();
      if (rows.length) result.schedule_pm = rows;
    }

    // Stok material
    if (msg.includes("stok")||msg.includes("material")||msg.includes("barang")||msg.includes("gudang")) {
      result.stok_material = db.prepare("SELECT * FROM stok_material ORDER BY stok_aktual - stok_minimum ASC").all();
    }

    // Work Order
    if (msg.includes("work order")||msg.includes(" wo")||msg.includes("temuan")||msg.includes("pekerjaan")) {
      result.work_order = db.prepare("SELECT * FROM work_order ORDER BY CASE prioritas WHEN 'urgent' THEN 1 WHEN 'tinggi' THEN 2 ELSE 3 END, tgl_masuk DESC").all();
    }

    // Vendor
    if (msg.includes("vendor")||msg.includes("kontraktor")) {
      result.vendor = db.prepare("SELECT * FROM vendor ORDER BY nama").all();
    }

    // Compliance/dokumen
    if (msg.includes("dokumen")||msg.includes("slo")||msg.includes("silo")||msg.includes("expired")||msg.includes("compliance")||msg.includes("perizinan")) {
      db.prepare("UPDATE compliance SET hari_tersisa=CAST((julianday(tgl_expired)-julianday('now')) AS INTEGER) WHERE tgl_expired!=''").run();
      result.compliance = db.prepare("SELECT * FROM compliance ORDER BY hari_tersisa ASC").all();
    }

    // Budget
    if (msg.includes("budget")||msg.includes("anggaran")||msg.includes("realisasi")) {
      result.budget = db.prepare("SELECT * FROM budget WHERE tahun=? ORDER BY jenis, bulan").all(tahun);
    }

    // Utility
    if (msg.includes("utility")||msg.includes("listrik")||msg.includes("air")||msg.includes("gas")||msg.includes("meter")) {
      result.utility = db.prepare("SELECT * FROM utility_meter ORDER BY tanggal DESC LIMIT 100").all();
    }

    // Status database (ketika ditanya "ada data" / "sudah sync")
    if (msg.includes("ada data")||msg.includes("sudah ada")||msg.includes("punya data")||msg.includes("status data")||msg.includes("sudah disync")||msg.includes("sudah diimport")) {
      result.db_status = db.prepare("SELECT tab, synced_at, row_count, status FROM sync_log GROUP BY tab HAVING MAX(id) ORDER BY tab").all();
    }

    // Selalu sertakan jumlah data ringkasan
    result.db_counts = {
      manpower:     db.prepare("SELECT COUNT(*) as c FROM manpower").get().c,
      pic_equipment:db.prepare("SELECT COUNT(*) as c FROM pic_equipment").get().c,
      schedule_pm:  db.prepare("SELECT COUNT(*) as c FROM schedule_pm").get().c,
      stok_material:db.prepare("SELECT COUNT(*) as c FROM stok_material").get().c,
      work_order:   db.prepare("SELECT COUNT(*) as c FROM work_order").get().c,
      budget:       db.prepare("SELECT COUNT(*) as c FROM budget").get().c,
      compliance:   db.prepare("SELECT COUNT(*) as c FROM compliance").get().c,
    };

    ok(res, result);
  } catch(e) { fail(res, e.message, 500); }
});

// Data endpoints individual
app.get("/api/manpower",    (req,res) => { try { const {bulan,tahun,tanggal} = req.query; let q="SELECT * FROM manpower WHERE 1=1"; const p=[]; if(tanggal){q+=" AND tanggal=?";p.push(tanggal);} else {if(bulan){q+=" AND strftime('%m',tanggal)=?";p.push(bulan.padStart(2,"0"));} if(tahun){q+=" AND strftime('%Y',tanggal)=?";p.push(tahun);}} q+=" ORDER BY tanggal,jabatan,nama"; ok(res,db.prepare(q).all(...p)); } catch(e){fail(res,e.message,500);} });
app.get("/api/pic-equipment",(req,res) => { try { const {divisi} = req.query; let q="SELECT * FROM pic_equipment WHERE 1=1"; const p=[]; if(divisi){q+=" AND divisi=?";p.push(divisi);} q+=" ORDER BY divisi,nama"; ok(res,db.prepare(q).all(...p)); } catch(e){fail(res,e.message,500);} });
app.get("/api/schedule-pm", (req,res) => { try { const {status} = req.query; let q="SELECT * FROM schedule_pm WHERE 1=1"; const p=[]; if(status){q+=" AND status=?";p.push(status);} q+=" ORDER BY tanggal_plan"; ok(res,db.prepare(q).all(...p)); } catch(e){fail(res,e.message,500);} });
app.get("/api/stok-material",(req,res) => { try { ok(res,db.prepare("SELECT * FROM stok_material ORDER BY stok_aktual-stok_minimum ASC, nama").all()); } catch(e){fail(res,e.message,500);} });
app.get("/api/work-order",  (req,res) => { try { const {status} = req.query; let q="SELECT * FROM work_order WHERE 1=1"; const p=[]; if(status){q+=" AND status=?";p.push(status);} q+=" ORDER BY CASE prioritas WHEN 'urgent' THEN 1 WHEN 'tinggi' THEN 2 ELSE 3 END"; ok(res,db.prepare(q).all(...p)); } catch(e){fail(res,e.message,500);} });
app.get("/api/budget",      (req,res) => { try { const {tahun} = req.query; const t=tahun||new Date().getFullYear(); ok(res,db.prepare("SELECT * FROM budget WHERE tahun=? ORDER BY jenis,bulan").all(String(t))); } catch(e){fail(res,e.message,500);} });
app.get("/api/compliance",  (req,res) => { try { db.prepare("UPDATE compliance SET hari_tersisa=CAST((julianday(tgl_expired)-julianday('now')) AS INTEGER) WHERE tgl_expired!=''").run(); ok(res,db.prepare("SELECT * FROM compliance ORDER BY hari_tersisa ASC").all()); } catch(e){fail(res,e.message,500);} });
app.get("/api/vendor",      (req,res) => { try { ok(res,db.prepare("SELECT * FROM vendor ORDER BY nama").all()); } catch(e){fail(res,e.message,500);} });
app.get("/api/utility",     (req,res) => { try { const {jenis,area} = req.query; let q="SELECT * FROM utility_meter WHERE 1=1"; const p=[]; if(jenis){q+=" AND jenis=?";p.push(jenis);} if(area){q+=" AND area=?";p.push(area);} q+=" ORDER BY tanggal DESC LIMIT 200"; ok(res,db.prepare(q).all(...p)); } catch(e){fail(res,e.message,500);} });

// Update status WO (dari AI)
app.put("/api/work-order/:no_wo", (req,res) => {
  try {
    const {status,catatan,tgl_selesai,pic} = req.body;
    db.prepare("UPDATE work_order SET status=COALESCE(?,status), catatan=COALESCE(?,catatan), tgl_selesai=COALESCE(?,tgl_selesai), pic=COALESCE(?,pic) WHERE no_wo=?")
      .run(status,catatan,tgl_selesai,pic,req.params.no_wo);
    ok(res, { updated: true });
  } catch(e) { fail(res,e.message,500); }
});

// Update status PM (dari AI)
app.put("/api/schedule-pm/:id", (req,res) => {
  try {
    const {status,tanggal_aktual,catatan,pic} = req.body;
    db.prepare("UPDATE schedule_pm SET status=COALESCE(?,status), tanggal_aktual=COALESCE(?,tanggal_aktual), catatan=COALESCE(?,catatan), pic=COALESCE(?,pic) WHERE id=?")
      .run(status,tanggal_aktual,catatan,pic,req.params.id);
    ok(res, { updated: true });
  } catch(e) { fail(res,e.message,500); }
});

// ─── CLAUDE PROXY ─────────────────────────────────────────────────────────────
app.post("/api/claude", async (req, res) => {
  try {
    const { api_key, model, max_tokens, system, messages } = req.body;
    if (!api_key) return fail(res, "API key tidak ada", 401);
    const body = JSON.stringify({ model, max_tokens, system, messages });
    const opts = {
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "Content-Type":"application/json","Content-Length":Buffer.byteLength(body),"x-api-key":api_key,"anthropic-version":"2023-06-01" }
    };
    const proxyReq = https.request(opts, (proxyRes) => {
      let data = "";
      proxyRes.on("data", c => data += c);
      proxyRes.on("end", () => {
        try { res.status(proxyRes.statusCode).json(JSON.parse(data)); }
        catch(e) { res.status(500).json({ error: { message: "Invalid response" } }); }
      });
    });
    proxyReq.on("error", e => res.status(500).json({ error: { message: e.message } }));
    proxyReq.write(body);
    proxyReq.end();
  } catch(e) { fail(res, e.message, 500); }
});

// Auto Generate Schedule PM endpoint
app.post("/api/generate-pm", (req, res) => {
  try {
    const bulan = String(req.body.bulan || 4).padStart(2, "0");
    const tahun = String(req.body.tahun || 2026);

    // 1. Ambil semua equipment
    const equipment = db.prepare("SELECT * FROM pic_equipment ORDER BY divisi, nama").all();
    if (!equipment.length) return fail(res, "Data PIC Equipment kosong. Sync dari Sheets dulu.");

    // 2. Ambil jadwal manpower bulan ini
    const manpower = db.prepare(
      "SELECT nama, tanggal, hari, shift FROM manpower WHERE strftime('%m',tanggal)=? AND strftime('%Y',tanggal)=? ORDER BY tanggal"
    ).all(bulan, tahun);
    if (!manpower.length) return fail(res, "Data Manpower bulan " + bulan + "/" + tahun + " kosong.");

    // 3. Index manpower: { "SINYO": { "2026-04-01": {shift, hari} } }
    const mpIdx = {};
    manpower.forEach(r => {
      if (!mpIdx[r.nama]) mpIdx[r.nama] = {};
      mpIdx[r.nama][r.tanggal] = { shift: r.shift, hari: r.hari };
    });

    const allDates = [...new Set(manpower.map(r => r.tanggal))].sort();

    // 4. Helpers
    const getJam  = s => { if (!s || s === "OFF") return null; const m = s.match(/^(\d{2})/); return m ? parseInt(m[1]) : null; };
    const isAC    = n => n.toLowerCase().includes("ac split");
    const isEsc   = n => n.toLowerCase().includes("escalator") || n.toLowerCase().includes("eskalator");
    const isLET   = n => { const l = n.toLowerCase(); return l.includes("escalator")||l.includes("eskalator")||l.includes("lift")||l.includes("elevator")||l.includes("travelator"); };
    const escNum  = n => { const m = n.match(/(\d+)/); return m ? parseInt(m[1]) : 0; };

    // 5. Generate jadwal
    const schedule = [];
    const beban = {}; // beban[tanggal][pic] = jumlah PM
    allDates.forEach(d => { beban[d] = {}; });

    // Sort: AC Split dan Escalator diprioritaskan karena constraint ketat
    const sorted = [...equipment].sort((a, b) => {
      const sa = isAC(a.nama) ? 0 : isEsc(a.nama) ? 1 : 2;
      const sb = isAC(b.nama) ? 0 : isEsc(b.nama) ? 1 : 2;
      return sa - sb;
    });

    sorted.forEach(eq => {
      const pic = eq.pic;
      const ps  = mpIdx[pic] || {};

      const candidates = allDates.filter(tgl => {
        const info = ps[tgl];
        if (!info || !info.shift || info.shift === "OFF") return false;
        const jam = getJam(info.shift);
        if (isAC(eq.nama)) return info.hari === "MINGGU";
        if (isEsc(eq.nama) && [7,8].includes(escNum(eq.nama))) return jam === 7 || jam === 9;
        if (isEsc(eq.nama)) return jam === 15;
        return true;
      });

      const pool = candidates.length ? candidates : allDates.filter(tgl => {
        const info = ps[tgl]; return info && info.shift && info.shift !== "OFF";
      });

      if (!pool.length) return; // PIC tidak hadir sama sekali

      // Pilih tanggal dengan beban terkecil, dengan memperhatikan constraint LET
      pool.sort((a, b) => (beban[a][pic]||0) - (beban[b][pic]||0));

      let chosen = pool[0];
      if (isLET(eq.nama)) {
        const letFree = pool.find(tgl => {
          const sh = ps[tgl]?.shift;
          const cnt = schedule.filter(s => s.tanggal_plan===tgl && s.pic===pic && isLET(s.equipment) && (mpIdx[pic]?.[tgl]?.shift)===sh).length;
          return cnt < 1;
        });
        if (letFree) chosen = letFree;
      }

      beban[chosen][pic] = (beban[chosen][pic]||0) + 1;
      schedule.push({
        equipment: eq.nama, divisi: eq.divisi, pic,
        tanggal_plan: chosen, status: "pending",
        catatan: !candidates.length ? "Fallback: tidak ada tanggal ideal" : ""
      });
    });

    // 6. Simpan ke DB
    db.prepare("DELETE FROM schedule_pm").run();
    const ins = db.prepare("INSERT INTO schedule_pm (equipment,divisi,pic,tanggal_plan,status,catatan) VALUES (?,?,?,?,?,?)");
    db.transaction(rows => rows.forEach(r => ins.run(r.equipment,r.divisi,r.pic,r.tanggal_plan,r.status,r.catatan)))(schedule);

    // 7. Ringkasan per tanggal
    const byDate = {};
    schedule.forEach(s => { if(!byDate[s.tanggal_plan]) byDate[s.tanggal_plan]=[]; byDate[s.tanggal_plan].push(s); });
    const summary = Object.entries(byDate).sort().map(([tgl,items]) => ({
      tanggal: tgl, jumlah: items.length, teknisi: [...new Set(items.map(i=>i.pic))]
    }));

    ok(res, { total: schedule.length, bulan, tahun, summary, message: `Schedule PM ${bulan}/${tahun} selesai dibuat: ${schedule.length} jadwal` });
  } catch(e) { fail(res, e.message, 500); }
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   JARVIS Backend — ONLINE                ║
  ║   http://localhost:${PORT}                  ║
  ╚══════════════════════════════════════════╝`);

  // Auto sync dari Sheets saat startup
  console.log("[STARTUP] Sync dari Google Sheets...");
  try {
    const results = await sheets.syncAll();
    Object.entries(results).forEach(([tab,r]) => {
      console.log(`  ${r.status==="ok"?"✓":"✗"} ${tab}: ${r.count||0} baris ${r.error?`(${r.error})`:""}`)
    });
    console.log("[STARTUP] Sync selesai.");
  } catch(e) {
    console.log("[STARTUP] Sync gagal:", e.message);
  }
});

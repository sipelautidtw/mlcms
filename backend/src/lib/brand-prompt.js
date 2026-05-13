import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAND_BRIEF_PATH = path.resolve(__dirname, "../../../prompts/brand-brief.yaml");

let cachedConfig = null;
let cachedSystemPrompt = null;
let cachedAt = null;
const CACHE_TTL_MS = 60 * 1000; // 60 detik — cukup untuk hot reload saat Owner update

/**
 * Load Brand Brief YAML config dari disk.
 * Caching dengan TTL pendek supaya Owner bisa update YAML dan langsung kebaca tanpa restart.
 */
export function loadBrandBrief({ forceReload = false } = {}) {
  const now = Date.now();
  if (!forceReload && cachedConfig && cachedAt && now - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }
  if (!fs.existsSync(BRAND_BRIEF_PATH)) {
    throw new Error(`Brand Brief tidak ditemukan di ${BRAND_BRIEF_PATH}`);
  }
  const yamlText = fs.readFileSync(BRAND_BRIEF_PATH, "utf8");
  cachedConfig = YAML.parse(yamlText);
  cachedAt = now;
  cachedSystemPrompt = null; // invalidate prompt cache
  return cachedConfig;
}

/**
 * Bangun system prompt lengkap dari Brand Brief.
 * Handle field null secara explicit — beritahu AI apa yang tidak boleh di-invent.
 */
export function buildSystemPrompt({ forceReload = false } = {}) {
  const cfg = loadBrandBrief({ forceReload });
  if (cachedSystemPrompt && !forceReload) return cachedSystemPrompt;

  const c = cfg.company;
  const lines = [];

  // === HEADER & PERAN ===
  lines.push(`# IDENTITAS & PERAN ANDA

Anda adalah **AI Asisten** untuk Maritime Lentera AI Content Management System v2.0.

Tugas Anda:
1. Menjawab pertanyaan Manajer Konten / Owner tentang strategi konten Maritime Lentera
2. Menghasilkan konten (caption sosmed, artikel, copy iklan, template DM) sesuai brand voice
3. Memberikan analisis dan saran berbasis Brand Brief di bawah ini

Mode operasi: **Human-in-the-Loop**. Setiap output Anda adalah DRAFT untuk review manusia, tidak pernah final untuk auto-publish.
`);

  // === IDENTITAS ===
  lines.push(`# BRAND BRIEF — IDENTITAS PERUSAHAAN

- Nama Hukum: ${c.legal_name}
- Brand: **${c.brand_name}**
- Berdiri: ${c.founded_year}
- Pendiri: **${c.founder.name}**${c.founder.title ? ` — ${c.founder.title}` : ""}
- LinkedIn Founder: ${c.founder.linkedin_personal || "(belum tersedia)"}
- Tagline: "${c.tagline}"

## Kantor
${c.offices.map((o) => `- ${o.city}: ${o.address}`).join("\n")}

## Misi
- EN: ${c.mission.en}
- ID: ${c.mission.id}

## Visi
- EN: ${c.vision.en}
- ID: ${c.vision.id}

## Nilai Inti (FONDASI SETIAP KONTEN)
${c.values.map((v) => `- **${v.name} (${v.id_name}):** ${v.description}`).join("\n")}

## Pencapaian (boleh dipakai untuk konten credibility)
- ${c.achievements.completed_projects} Completed Projects
- ${c.achievements.happy_clients} Happy Clients
- ${c.achievements.awards} Awards
- ${c.achievements.worldwide_offices} Worldwide Offices

## Sejarah / Milestone
${c.milestones.map((m) => `- ${m.year}: ${m.event}`).join("\n")}
`);

  // === LAYANAN ===
  const s = cfg.services;
  lines.push(`# LAYANAN

## Layanan Utama Saat Ini
${s.primary.map((x) => `- **${x.name}:** ${x.description}`).join("\n")}

## Pengalaman Heritage
${s.heritage.map((x) => `- ${x.name} (sejak ${x.since}, segmen: ${x.segment})`).join("\n")}

## Spesialisasi
${s.specializations.map((x) => `- ${x}`).join("\n")}

## Tipe Kapal yang Ditangani
${s.vessel_types.join(", ")}`);

  if (s.not_offered.length > 0) {
    lines.push(`
## Layanan yang TIDAK Dikerjakan
${s.not_offered.map((x) => `- ${x}`).join("\n")}`);
  } else {
    lines.push(`
## Layanan yang TIDAK Dikerjakan
**[BELUM DIDEFINISIKAN]** Jika user bertanya apakah Maritime Lentera melakukan layanan X yang tidak terdaftar di "Layanan Utama" atau "Heritage", JANGAN ASUMSI. Jawab: "Untuk konfirmasi cakupan layanan tersebut, silakan hubungi tim Maritime Lentera langsung."`);
  }

  if (s.certifications.length > 0) {
    lines.push(`
## Sertifikasi & Afiliasi
${s.certifications.map((x) => `- ${x}`).join("\n")}`);
  }

  // === AUDIENS ===
  const a = cfg.audience;
  lines.push(`
# TARGET AUDIENS

## Primer
${a.primary.segments.map((x) => `- ${x}`).join("\n")}

Profile decision maker: ${a.primary.decision_maker_profile.roles.join(", ")} (usia ${a.primary.decision_maker_profile.age_range}). ${a.primary.decision_maker_profile.familiar_with_technical_jargon ? "Fasih dengan istilah teknis perkapalan." : "Awam terhadap istilah teknis."}

## Sekunder
${a.secondary.map((x) => `- ${x}`).join("\n")}
`);

  // === TONE OF VOICE ===
  const t = cfg.tone;
  lines.push(`# TONE OF VOICE

Personality: ${t.personality.join(", ")}

## Spektrum Tone (0-100)
- Formal-Casual: ${t.spectrum.formality_0to100}
- Teknis-Awam: ${t.spectrum.technicality_0to100}
- Serius-Humoris: ${t.spectrum.seriousness_0to100}
- Korporat ("kami")-Personal ("saya"): ${t.spectrum.voice_style_0to100}
- Hard-sell vs Edukatif: ${t.spectrum.sales_approach_0to100}
- Indonesia-English: ${t.spectrum.language_mix_0to100}

## Contoh DO (English)
${t.do_examples.en.map((x) => `- ✓ "${x}"`).join("\n")}

## Contoh DO (Bahasa Indonesia)
${t.do_examples.id.map((x) => `- ✓ "${x}"`).join("\n")}

## Contoh DO (Founder Voice — untuk LinkedIn Pak Ahlan personal)
${t.do_examples.founder_voice.map((x) => `- ✓ "${x}"`).join("\n")}

## DON'T
${t.dont_examples.map((x) => `- ✗ ${x}`).join("\n")}
`);

  // === PLATFORM ===
  lines.push(`# PLATFORM

## Aktif
${cfg.platforms.active
  .map(
    (p) =>
      `- **${p.name}** (id: ${p.id})
  - Voice: ${p.voice}
  - Bahasa default: ${p.default_language}
  - Fokus konten: ${p.content_focus}`
  )
  .join("\n")}

## Belum Aktif (akun belum dibuat)
${cfg.platforms.pending.map((p) => `- ${p.id}: ${p.reason}`).join("\n")}

**Aturan platform yang belum aktif:** Saat user minta konten untuk platform pending, beri tahu: "Maritime Lentera belum memiliki akun di [platform], tapi saya bisa membuat draft yang siap dipost saat akun tersebut dibuat."
`);

  // === KONTAK ===
  const contactsEntries = Object.entries(cfg.contacts);
  const available = contactsEntries.filter(([, v]) => v);
  const pending = contactsEntries.filter(([, v]) => !v);

  lines.push(`# KONTAK UNTUK CTA

## Tersedia (boleh dipakai)
${available.map(([k, v]) => `- ${k}: ${v}`).join("\n") || "(tidak ada — gunakan website saja)"}

## Belum Tersedia (JANGAN INVENT)
${pending.map(([k]) => `- ${k}`).join("\n") || "(semua kontak tersedia)"}

**Aturan kontak hilang:** Saat butuh CTA dengan kontak yang null, gunakan hanya yang tersedia. Fallback: website > linkedin_personal > tanpa CTA kontak.
`);

  // === PILAR KONTEN ===
  lines.push(`# PILAR KONTEN

${cfg.content_pillars
  .map(
    (p) =>
      `- **${p.name}** (${p.status}, ${p.frequency}): ${p.description}${
        p.primary_platform ? ` [primary platform: ${p.primary_platform}]` : ""
      }`
  )
  .join("\n")}
`);

  // === AI RULES ===
  lines.push(`# ATURAN KETAT — JANGAN DILANGGAR

## Topik DILARANG
${cfg.ai_rules.forbidden_topics.map((x) => `- ✗ ${x}`).join("\n")}

## Hal yang TIDAK BOLEH Anda Invent
${cfg.ai_rules.never_invent.map((x) => `- ✗ ${x}`).join("\n")}

## Konten yang Wajib Approval Owner (Level 2)
${cfg.ai_rules.approval_required_owner_level_2.map((x) => `- ${x}`).join("\n")}
Saat user minta jenis konten di atas, generate draftnya tapi BERI LABEL DI AWAL: "⚠️ Konten ini membutuhkan approval Owner sebelum publish."
`);

  // === DYNAMIC INFO ===
  const d = cfg.dynamic_info;
  if (d.last_updated) {
    lines.push(`# INFORMASI BISNIS TERKINI

Terakhir diupdate: ${d.last_updated}${d.updated_by ? ` oleh ${d.updated_by}` : ""}

## Klien yang Sudah Approve Disebut
${d.approved_clients_to_mention.length > 0 ? d.approved_clients_to_mention.map((x) => `- ${x}`).join("\n") : "(belum ada)"}

## Proyek Aktif
${d.active_projects.length > 0 ? d.active_projects.map((p) => `- ${p.name} (klien: ${p.can_mention_client_name ? p.client : "[NDA]"}, status: ${p.status})`).join("\n") : "(belum ada)"}

## Pencapaian Terbaru
${d.recent_achievements.length > 0 ? d.recent_achievements.map((x) => `- ${x}`).join("\n") : "(belum ada)"}

## Event Mendatang
${d.upcoming_events.length > 0 ? d.upcoming_events.map((x) => `- ${x}`).join("\n") : "(belum ada)"}

## Topik Sensitif Periode Ini (Hindari)
${d.sensitive_topics_this_period.length > 0 ? d.sensitive_topics_this_period.map((x) => `- ${x}`).join("\n") : "(tidak ada)"}
`);
  } else {
    lines.push(`# INFORMASI BISNIS TERKINI

**[BELUM ADA UPDATE]** Saat user minta konten yang butuh referensi proyek terbaru, klien spesifik, atau event, beri tahu: "Saya belum memiliki informasi terbaru di Brand Brief. Mohon Owner update bagian Dynamic Info di prompts/brand-brief.yaml terlebih dahulu." Jangan invent.
`);
  }

  // === CARA MERESPON ===
  lines.push(`# CARA MERESPON USER

1. **Bahasa chat dengan user**: Bahasa Indonesia, kecuali user eksplisit minta English.
2. **Bahasa konten yang Anda generate**: ikuti default platform tujuan (lihat Platform).
3. **Saat ragu antara dua pilihan**, pilih yang lebih sesuai 3 nilai inti: Integrity, Precision, Long-term Partnership.
4. **Saat field penting kosong**, beritahu user dengan ramah dan beri saran update YAML.
5. **Setiap output Anda adalah draft**, bukan final. User akan review manual sebelum publish.
6. **Format konten yang Anda generate**: rapi, jelas struktur, siap copy-paste.
`);

  cachedSystemPrompt = lines.join("\n");
  return cachedSystemPrompt;
}

/**
 * Inspect config tanpa expose semua detail (untuk endpoint debug).
 */
export function inspectBrandBrief() {
  const cfg = loadBrandBrief();
  return {
    version: cfg.meta?.version,
    last_updated: cfg.meta?.last_updated,
    brand: cfg.company?.brand_name,
    founder: cfg.company?.founder?.name,
    offices_count: cfg.company?.offices?.length || 0,
    services_primary_count: cfg.services?.primary?.length || 0,
    services_not_offered_count: cfg.services?.not_offered?.length || 0,
    platforms_active: cfg.platforms?.active?.map((p) => p.id) || [],
    platforms_pending: cfg.platforms?.pending?.map((p) => p.id) || [],
    contacts_available: Object.entries(cfg.contacts || {})
      .filter(([, v]) => v)
      .map(([k]) => k),
    contacts_pending: Object.entries(cfg.contacts || {})
      .filter(([, v]) => !v)
      .map(([k]) => k),
    pillars_count: cfg.content_pillars?.length || 0,
    dynamic_info_last_updated: cfg.dynamic_info?.last_updated,
  };
}

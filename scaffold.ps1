# =====================================================================
# Maritime Lentera AI CMS — Project Scaffolding Script
# =====================================================================
# Menjalankan ini di D:\maritime-lentera-cms akan membuat:
#   - backend/    (Node.js + Express + Prisma + MySQL)
#   - frontend/   (React + Vite + Tailwind CSS)
#   - .gitignore, README.md
# =====================================================================

$ErrorActionPreference = "Stop"
$env:NPM_CONFIG_YES = "true"

# Pastikan kita berada di folder project
$projectRoot = (Get-Location).Path
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " Scaffolding Maritime Lentera CMS" -ForegroundColor Cyan
Write-Host " Project root: $projectRoot" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------
# Bersihkan folder frontend kosong yang sudah ada
# ---------------------------------------------------------------------
if (Test-Path "frontend") {
    Write-Host "[1/5] Membersihkan frontend/ lama yang masih kosong..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force frontend
}

# =====================================================================
# BACKEND
# =====================================================================
Write-Host "[2/5] Membangun backend/..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path backend | Out-Null
Push-Location backend

# Inisialisasi package.json
npm init -y | Out-Null

# Tambah type=module & scripts
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$pkg | Add-Member -NotePropertyName "type" -NotePropertyValue "module" -Force
$pkg.scripts = [ordered]@{
    dev                  = "nodemon src/index.js"
    start                = "node src/index.js"
    "prisma:generate"    = "prisma generate"
    "prisma:migrate"     = "prisma migrate deploy"
    "prisma:migrate:dev" = "prisma migrate dev"
}
$pkg | ConvertTo-Json -Depth 10 | Set-Content package.json -Encoding UTF8

# Install dependencies
Write-Host "       Installing backend dependencies..." -ForegroundColor DarkGray
npm install express cors dotenv mysql2 @prisma/client | Out-Null
npm install -D nodemon prisma | Out-Null

# Inisialisasi Prisma
Write-Host "       Initializing Prisma..." -ForegroundColor DarkGray
npx prisma init --datasource-provider mysql 2>&1 | Out-Null

# --- src/index.js ---
New-Item -ItemType Directory -Path src/routes -Force | Out-Null
@'
import "dotenv/config";
import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.js";

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "*";

app.use(
  cors({
    origin: FRONTEND_URL === "*" ? "*" : FRONTEND_URL.split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

app.use("/api/health", healthRouter);

// 404 handler
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("[error]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`[ml-cms-api] listening on port ${PORT}`);
});
'@ | Set-Content src/index.js -Encoding UTF8

# --- src/routes/health.js ---
@'
import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/", async (req, res) => {
  let dbStatus = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "ok";
  } catch (err) {
    dbStatus = "error: " + err.message;
  }

  res.json({
    status: "ok",
    service: "ml-cms-api",
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

export default router;
'@ | Set-Content src/routes/health.js -Encoding UTF8

# --- src/lib/prisma.js ---
New-Item -ItemType Directory -Path src/lib -Force | Out-Null
@'
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "production" ? ["error"] : ["query", "error", "warn"],
});
'@ | Set-Content src/lib/prisma.js -Encoding UTF8

# --- .env.example ---
@'
NODE_ENV=production
PORT=3001

# Database — sesuaikan dengan kredensial MySQL VPS Anda
DATABASE_URL="mysql://mlcms:GANTI_PASSWORD_KUAT@localhost:3306/ml_cms"

# JWT — generate string random panjang
JWT_SECRET=ganti_dengan_string_random_panjang_minimal_32_karakter

# Anthropic Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Frontend URL (untuk CORS)
FRONTEND_URL=https://cms.idteknowarrior.com
'@ | Set-Content .env.example -Encoding UTF8

# --- prisma/schema.prisma ---
@'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// =========================================================
// User & Auth
// =========================================================
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String?
  name         String
  role         Role     @default(MANAGER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  contents     ContentItem[] @relation("ContentAuthor")
  approvals    ContentItem[] @relation("ContentApprover")
}

enum Role {
  OWNER
  MANAGER
}

// =========================================================
// Content (Phase 1: minimal — diperluas di fase berikutnya)
// =========================================================
model ContentItem {
  id          String        @id @default(uuid())
  title       String
  body        String        @db.Text
  language    Language      @default(ID)
  platform    String?       // instagram, linkedin, facebook, wordpress, dll
  status      ContentStatus @default(DRAFT)
  scheduledAt DateTime?
  publishedAt DateTime?

  authorId    String
  author      User          @relation("ContentAuthor", fields: [authorId], references: [id])

  approverId  String?
  approver    User?         @relation("ContentApprover", fields: [approverId], references: [id])

  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}

enum Language {
  ID
  EN
}

enum ContentStatus {
  DRAFT
  PENDING_REVIEW
  APPROVED
  SCHEDULED
  POSTED
  ARCHIVED
}
'@ | Set-Content prisma/schema.prisma -Encoding UTF8

Pop-Location

# =====================================================================
# FRONTEND
# =====================================================================
Write-Host "[3/5] Membangun frontend/ dengan Vite..." -ForegroundColor Yellow
npm create vite@latest frontend -- --template react 2>&1 | Out-Null

Push-Location frontend
Write-Host "       Installing frontend dependencies..." -ForegroundColor DarkGray
npm install | Out-Null
npm install axios | Out-Null
npm install -D tailwindcss@3 postcss autoprefixer | Out-Null
npx tailwindcss init -p 2>&1 | Out-Null

# --- tailwind.config.js ---
@'
/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        maritime: {
          50: "#f0f7ff",
          500: "#1e6fb8",
          700: "#155084",
          900: "#0d3252",
        },
      },
    },
  },
  plugins: [],
};
'@ | Set-Content tailwind.config.js -Encoding UTF8

# --- src/index.css ---
@'
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
'@ | Set-Content src/index.css -Encoding UTF8

# --- src/App.jsx ---
@'
import { useEffect, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/api";

export default function App() {
  const [status, setStatus] = useState({ state: "loading" });

  useEffect(() => {
    axios
      .get(`${API_URL}/health`)
      .then((res) => setStatus({ state: "ok", data: res.data }))
      .catch((err) =>
        setStatus({ state: "error", message: err.message || "Unknown error" })
      );
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-maritime-50 to-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-lg bg-maritime-500 flex items-center justify-center text-white font-bold">
            ML
          </div>
          <h1 className="text-xl font-bold text-maritime-900">
            Maritime Lentera
          </h1>
        </div>
        <p className="text-sm text-slate-500 mb-6 ml-13">
          AI Content Management System &middot; v2.0
        </p>

        <div className="border-t border-slate-200 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            System Status
          </p>

          {status.state === "loading" && (
            <div className="flex items-center gap-2 text-amber-600">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="text-sm">Connecting to API...</span>
            </div>
          )}

          {status.state === "ok" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-sm font-medium">API Online</span>
              </div>
              <div className="text-xs text-slate-500 pl-4">
                Database: <span className="font-mono">{status.data.database}</span>
              </div>
              <div className="text-xs text-slate-500 pl-4">
                {new Date(status.data.timestamp).toLocaleString("id-ID")}
              </div>
            </div>
          )}

          {status.state === "error" && (
            <div className="flex items-start gap-2 text-rose-600">
              <span className="w-2 h-2 rounded-full bg-rose-500 mt-1.5"></span>
              <div>
                <p className="text-sm font-medium">API Unreachable</p>
                <p className="text-xs text-rose-500 mt-1">{status.message}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
'@ | Set-Content src/App.jsx -Encoding UTF8

# --- .env.example ---
@'
VITE_API_URL=https://cms.idteknowarrior.com/api
'@ | Set-Content .env.example -Encoding UTF8

# --- .env.development (untuk dev lokal) ---
@'
VITE_API_URL=http://localhost:3001/api
'@ | Set-Content .env.development -Encoding UTF8

Pop-Location

# =====================================================================
# ROOT FILES
# =====================================================================
Write-Host "[4/5] Membuat .gitignore & README.md..." -ForegroundColor Yellow

@'
# Dependencies
node_modules/

# Environment
.env
.env.local
.env.*.local

# Build output
dist/
build/

# Logs
logs/
*.log
npm-debug.log*

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Prisma
backend/prisma/migrations/dev.db*
'@ | Set-Content .gitignore -Encoding UTF8

@'
# Maritime Lentera AI CMS

Sistem manajemen konten berbasis AI untuk Maritime Lentera — sesuai Dokumen Perencanaan v2.0.

## Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express + Prisma ORM
- **Database**: MySQL
- **AI Engine**: Anthropic Claude API
- **Deployment**: VPS (Nginx + PM2 + Certbot)

## Struktur

```
.
├── backend/      Node.js API (port 3001)
├── frontend/    React SPA (build → dist/)
└── .github/      CI/CD workflows
```

## Quick Start (Local Dev)

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env: isi DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY
npm install
npx prisma migrate dev
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env.development   # API URL untuk dev lokal
npm install
npm run dev
```

## Deployment (VPS)

Lihat dokumen `DEPLOY.md` (akan ditambahkan).

## Roadmap

Implementasi 6 fase sesuai BAB 6 Dokumen Perencanaan v2.0:

- **Fase 1** (M1-2): AI Chat Interface + Content Generator + Manual Posting Assistant
- **Fase 2** (M3-4): Content Planner & Scheduler + Posting Reminder
- **Fase 3** (M5-6): Content Library + WordPress/Meta Auto-Post
- **Fase 4** (M7-8): Content Audit System + LinkedIn API + KPI Config
- **Fase 5** (B3): Content Intelligence + X/TikTok/YouTube API
- **Fase 6** (B3-4): Owner Dashboard + Alert System + Model Switching

## Lisensi

Confidential — Internal Use Only.
'@ | Set-Content README.md -Encoding UTF8

# =====================================================================
# SELESAI
# =====================================================================
Write-Host "[5/5] Selesai!" -ForegroundColor Yellow
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host " SCAFFOLD SUKSES" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Struktur yang dibuat:" -ForegroundColor White
Write-Host "  backend/   — Express + Prisma (MySQL)" -ForegroundColor Gray
Write-Host "  frontend/  — React + Vite + Tailwind" -ForegroundColor Gray
Write-Host "  .gitignore, README.md" -ForegroundColor Gray
Write-Host ""
Write-Host "Langkah berikutnya:" -ForegroundColor White
Write-Host "  1. Cek hasil dengan: ls" -ForegroundColor Gray
Write-Host "  2. git add . && git commit && git push" -ForegroundColor Gray
Write-Host "  3. Pull di VPS lalu setup .env dan deploy" -ForegroundColor Gray
Write-Host ""

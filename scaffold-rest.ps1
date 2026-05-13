# =====================================================================
# Maritime Lentera CMS — Frontend + Root Files Scaffold
# Lanjutan setelah backend/ sudah jadi.
# Tidak ada redirect Out-Null supaya semua prompt & progress terlihat.
# =====================================================================

$ErrorActionPreference = "Stop"
$env:NPM_CONFIG_YES = "true"

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " Scaffold Frontend + Root Files" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# =====================================================================
# FRONTEND
# =====================================================================
Write-Host ">> [1/3] Scaffolding Vite + React..." -ForegroundColor Yellow
Write-Host "   (kalau ada prompt 'Ok to proceed?', ketik y dan Enter)" -ForegroundColor DarkGray
Write-Host ""

# Pakai npx --yes supaya tidak ada prompt instalasi
npx --yes create-vite@latest frontend --template react

if (-not (Test-Path "frontend")) {
    Write-Host "ERROR: folder frontend tidak terbuat. Hentikan script." -ForegroundColor Red
    exit 1
}

Push-Location frontend

Write-Host ""
Write-Host ">> [2/3] Installing dependencies..." -ForegroundColor Yellow
Write-Host ""
npm install
npm install axios
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p

Write-Host ""
Write-Host ">> Menulis file konfigurasi..." -ForegroundColor Yellow

# tailwind.config.js
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

# src/index.css
@'
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
'@ | Set-Content src/index.css -Encoding UTF8

# src/App.jsx
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

# .env.example
@'
VITE_API_URL=https://cms.idteknowarrior.com/api
'@ | Set-Content .env.example -Encoding UTF8

# .env.development
@'
VITE_API_URL=http://localhost:3001/api
'@ | Set-Content .env.development -Encoding UTF8

Pop-Location

# =====================================================================
# ROOT FILES
# =====================================================================
Write-Host ""
Write-Host ">> [3/3] Membuat .gitignore & README.md..." -ForegroundColor Yellow

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
cp .env.example .env.development
npm install
npm run dev
```

## Roadmap

Implementasi 6 fase sesuai BAB 6 Dokumen Perencanaan v2.0:

- **Fase 1** (M1-2): AI Chat + Content Generator + Manual Posting Assistant
- **Fase 2** (M3-4): Content Planner + Posting Reminder
- **Fase 3** (M5-6): Content Library + WordPress/Meta Auto-Post
- **Fase 4** (M7-8): Content Audit + LinkedIn API + KPI Config
- **Fase 5** (B3): Content Intelligence + X/TikTok/YouTube API
- **Fase 6** (B3-4): Owner Dashboard + Alert System + Model Switching

## Lisensi

Confidential — Internal Use Only.
'@ | Set-Content README.md -Encoding UTF8

Write-Host ""
Write-Host "===============================================" -ForegroundColor Green
Write-Host " SCAFFOLD SUKSES" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Langkah berikutnya:" -ForegroundColor White
Write-Host "  1. ls               # cek struktur" -ForegroundColor Gray
Write-Host "  2. git add ." -ForegroundColor Gray
Write-Host "  3. git commit -m 'initial scaffold'" -ForegroundColor Gray
Write-Host "  4. git push" -ForegroundColor Gray
Write-Host ""

# ⚡ SuperApp — All-in-One React Utility Suite

A modern React application combining document data processing, network diagnostic tools, ISP client validation, and developer utilities in a single cohesive dashboard.

**Runs on:** Docker + PostgreSQL (app on port 12000) · also deployable to Vercel (serverless API)

---

## Features

### 📄 Data Processor
- **Template Management** — Define fields with name, demo value, and validation rules (required, email, regex, min/max, minLength/maxLength)
- **Template Library** — Save and load named templates, persist to PostgreSQL
- **File Upload** — Drag-and-drop or browse for PDF, Excel (.xlsx, .xls), CSV
- **Smart Extraction** — Parse files to extract values matching template fields with AI (Claude API) and demo fallback
- **Validation Engine** — Validate each field against rules with per-row status badges
- **Fill from Sample** — 6-step workflow: upload demo → upload source → column map → process → preview → export
- **Preview & Export** — Table view with search, sort, pagination; export to CSV/JSON/styled Excel

### 🌐 Network Tools
| Tool | Features |
|------|----------|
| **Ping** | Single/continuous mode, latency chart (bar/line), summary stats, history saved to PostgreSQL |
| **Port Scanner** | Common ports (20), port range, custom list modes; 60+ service name DB; saved scan history |
| **DNS Lookup** | 8 record types (A, AAAA, MX, TXT, CNAME, NS, SOA, SRV); single & bulk lookup |
| **WHOIS** | Structured registration details (registrar, dates, name servers, contacts) |
| **Traceroute** | Hop-by-hop table with IP, hostname, and 3 RTT measurements |
| **IP Info** | Auto-detect public IP, geolocation, ISP, timezone, ASN via multi-API fallback |

### 📋 ISP Excel Validator
- **Template Support** — Admin (25 columns) and Mac (21 columns) fixed templates with exact headers
- **Drag-and-Drop Upload** — .xlsx file upload with template selection
- **Validation Engine** — Per-cell validation: phone (BD format 01XXXXXXXXX), email, dates (DD-MM-YYYY), bill month (MM-YYYY), status (Active/Inactive/Suspended), IP addresses, mandatory fields
- **Cell-Level Results** — Color-coded errors and warnings with detailed messages
- **Auto-Fix** — One-click fixes for common issues: phone formatting, date normalization, status casing, bill month conversion
- **Inline Editing** — Click any cell to edit with keyboard navigation (Tab, arrows, Enter, Escape)
- **Search & Filter** — Search across all columns; filter by All/Valid/Warnings/Errors
- **Download** — Exports fixed data as .xlsx with all cells stored as text to prevent Excel auto-conversion
- **Validation History** — Every run is saved to the `isp_validations` PostgreSQL table and listed for re-download
- **Animated Auto-Fix** — Visual progress steps showing which categories are being fixed

### 🧰 Utilities (18 tools)
| Tool | Description |
|------|-------------|
| **Base64** | Encode/decode text + file-to-Base64 encoding |
| **UUID Generator** | Generate v4 UUIDs (bulk, copy all) |
| **Password Generator** | Configurable length, char types, strength meter |
| **QR Code Generator** | Custom foreground/background, 4 size presets, SVG/PNG download |
| **File Hasher** | Drag-drop files, MD5/SHA-1/SHA-256/SHA-512 using Web Crypto API |
| **JSON Formatter** | Format/minify/validate, tree view, JSON path query |
| **Color Converter** | HEX/RGB/HSL with sliders, palette generator, WCAG contrast checker (AA/AAA) |
| **Text Case Converter** | 10 case types: UPPER, lower, Title, camelCase, PascalCase, snake_case, kebab-case, etc. |
| **URL Encoder/Decoder** | Encode/decode URI components |
| **Unit Converter** | Length, Weight, Temperature, Data Size — 25+ units |
| **Timer & Stopwatch** | Stopwatch with lap tracking + countdown mode |
| **Lorem Ipsum Generator** | Words, sentences, or paragraphs with configurable count |
| **Text Analyzer** | Character, word, sentence, paragraph counts; top 10 word frequency |
| **Number Base Converter** | Binary, Octal, Decimal, Hexadecimal |
| **Epoch Converter** | Timestamp ↔ human date, live preview |
| **Regex Tester** | Test patterns with highlighted matches, match list, replace |
| **PDF to Excel** | Extract PDF text content to Excel spreadsheets |

---

## Tech Stack

- **Frontend:** React 19 (functional components, hooks, Context API)
- **Routing:** React Router v7
- **Charts:** Recharts (ping latency visualization)
- **QR Codes:** qrcode.react
- **Styling:** CSS custom properties (light/dark theme)
- **Database:** PostgreSQL 16 (JSONB tables) with localStorage fallback
- **Build:** Vite 8
- **Backend:** Node.js + Express (network tools + ISP validator + `/api/db` CRUD)
- **Excel:** SheetJS (xlsx) for read/write with text-formatted cells

---

## Getting Started

The app runs on **http://localhost:12000** in every mode.

### Docker (recommended)

Brings up PostgreSQL and the app together. Nothing else to install.

```bash
npm run docker:up      # build + start, app on http://localhost:12000
npm run docker:logs    # follow app logs
npm run docker:down    # stop
npm run docker:reset   # wipe the database volume and start fresh
```

`db/init.sql` creates every table on the first start of an empty volume. After
changing that file, run `npm run docker:reset` — an existing volume is never
re-initialised.

### Local development (hot reload)

Requires the database. The easiest way is to leave PostgreSQL from the compose
stack running (it publishes `127.0.0.1:5432`):

```bash
docker compose up -d postgres   # database only

npm install
npm run dev:backend             # Express API on port 3001
npm run dev                     # Vite on http://localhost:12000
```

Vite proxies `/api/*` to the backend on 3001, so the frontend always uses
same-origin relative URLs and never needs a CORS exception.

### Environment Variables

None are required for the Docker setup. The backend reads:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` (`12000` in Docker) | Port the Express server listens on |
| `DATABASE_URL` | `postgresql://superapp:superapp_secret@localhost:5432/superapp` | PostgreSQL connection string |

If PostgreSQL is unreachable the UI still works — every page falls back to
`localStorage` and syncs to the database once it is available again.

---

## Deployment

### Docker (single container)

The root `Dockerfile` builds the frontend and serves it together with the API
from one Express process. Point `DATABASE_URL` at a PostgreSQL instance and the
platform's `$PORT` is honoured automatically.

```bash
docker build -t superapp .
docker run -p 12000:12000 -e DATABASE_URL=postgresql://... superapp
```

### Vercel (serverless API)

The `api/` directory contains serverless functions. Configure:

| Setting | Value |
|---------|-------|
| **Framework** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

Vercel's `vercel.json` rewrites `/api/*` to the Express serverless function in
`api/index.js`. Set `DATABASE_URL` to a hosted PostgreSQL instance.

---

## Database

PostgreSQL schema lives in `db/init.sql`. Two shapes of table:

- **Blob tables** — `(session_id UNIQUE, data JSONB)`, one row per browser
  session, driven by the generic `/api/db/:table` routes and the `useDbStorage`
  hook: `templates`, `extracted_data`, `ping_history`, `user_preferences`,
  `http_profiles`, `subdomain_history`, `scenarios`, `port_scans`,
  `pdf_conversions`, `api_collections`, `scan_campaigns`, `ssl_certificates`,
  `dashboard_targets`, `profiles`.
- **Structured tables** — their own columns and dedicated handlers:
  `data_sessions` (Fill-from-Sample / Smart Fill state), `network_checks`
  (append-only uptime log), `isp_validations` (validation run history).

A browser identifies itself with a `session_id` UUID kept in `localStorage`, so
no login is required.

Inspect the database directly with:

```bash
docker exec -it superapp-postgres-1 psql -U superapp -d superapp
```

---

## Backend API

The Express backend (`backend/server.js`) provides:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ping` | Ping a target (ICMP via system ping) |
| POST | `/api/scan-port` | TCP port scan |
| GET | `/api/dns` | DNS record lookup |
| GET | `/api/whois` | WHOIS domain/IP lookup |
| GET | `/api/traceroute` | Traceroute to target |
| GET | `/api/ip-info` | Public IP geolocation info |
| GET | `/api/http-headers` | Fetch response headers for a URL |
| GET | `/api/ssl-cert` | TLS certificate details for a host |
| GET | `/api/subdomain-discovery` | Enumerate subdomains |
| POST | `/api/http-test` | Send an arbitrary HTTP request with timings |
| POST | `/api/scan-campaign` | Subdomain discovery + port scan |
| POST | `/api/run-scenario` | Run a multi-step diagnostic scenario |
| POST | `/api/cmd` | Run an allowlisted system command |
| POST | `/api/mikrotik/test` | Test a MikroTik RouterOS connection |
| POST | `/api/snmp/check` · `/api/snmp/query` | SNMP device checks |
| POST | `/api/isp/validate` | Upload & validate ISP Excel file |
| POST | `/api/isp/autofix` | Auto-fix validation issues |
| POST | `/api/isp/download` | Download fixed data as .xlsx |
| GET | `/api/db/health` | Database connectivity check |
| GET/POST/PATCH/PUT/DELETE | `/api/db/:table` | Generic persistence (allowlisted tables only) |

---

## Project Structure

```
src/
├── components/
│   ├── Layout/          Navbar, Sidebar, Layout (routing shell)
│   └── common/          CopyButton, LoadingSpinner, ErrorMessage
├── pages/
│   ├── DataProcessor/   Template fields + upload + extraction + validation + fill-from-sample
│   ├── NetworkTools/    Ping, PortScanner, DNSLookup, Whois, Traceroute, IPInfo
│   └── Utilities/       18 utility tools + ISP Excel Validator
├── context/             ThemeContext
├── hooks/               useLocalStorage, useDbStorage (PostgreSQL-backed)
├── utils/               Validation engine, API client
├── styles/              Global CSS with CSS variables
├── App.jsx              Router + homepage
└── main.jsx             Entry point

backend/
├── server.js            Express server (API + serves frontend in production)
├── db.js                PostgreSQL connection pool
└── isp-validator.js     Shared validation, autofix, and Excel generation module

db/
└── init.sql             PostgreSQL schema, applied on first container start

api/
├── index.js             Vercel serverless Express (same endpoints as backend)
└── _isp-validator.js    Shared validator module (underscore prefix: ignored by Vercel)
```

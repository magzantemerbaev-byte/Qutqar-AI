# QUTQAR AI — Emergency Response Decision Support (prototype v0.3.1)

> **Prototype status.** QUTQAR AI is a university innovation / startup prototype. In DEMO MODE every incident, unit, department, weather value, risk index, trainee and score is **fictional**. The AI is **not** an authority of the Ministry of Emergency Situations of the Republic of Kazakhstan (MChS RK). Every operational recommendation carries the notice:
> *"AI-generated training/information assistance. Follow current official MChS RK procedures and the responsible commander's instructions."*
> The application never invents laws, regulations, contacts, phone numbers, internal MChS information or official statistics.

---

## Publish online (no installation needed)

The project is a static website on Vercel. It always runs in **DEMO MODE**, so it needs no backend, no AI key and no secrets.

1. **GitHub.** Create a free account at <https://github.com>. Click **+ → New repository**, enter the name `qutqar-ai`, choose **Public** or **Private**, and click **Create repository**.
2. **Upload the files.** On the new repository page, click **uploading an existing file**. Open the unzipped `qutqar-ai` folder, select **everything inside it** (not the folder itself), and drag it into the page. That is 94 files, including the folders `src`, `shared`, `server` and `public`. Click **Commit changes**.
3. **Vercel.** Go to <https://vercel.com>, click **Sign Up → Continue with GitHub**, then **Add New… → Project**. Choose the `qutqar-ai` repository and click **Import**, then **Deploy**. Leave all settings as they are; `vercel.json` configures everything.
4. After about one to two minutes Vercel shows **Congratulations** and a link such as `https://qutqar-ai.vercel.app`. That link is the public website.

**Updating the site.** Upload changed files to the same GitHub repository. Vercel republishes automatically.

**Useful links.** Direct links work after a page refresh:
- `…/#/presentation` opens presentation mode.
- `…/#/simulator?view=instructor` opens the instructor dashboard.
- `…/#/briefing?incident=inc-007` opens a briefing for a specific incident.

**Why DEMO MODE is enforced on the public site.** The public build always runs in DEMO MODE, and the LIVE switch is locked. This is controlled by `VITE_PUBLIC_DEMO`. It defaults to on, and only `VITE_PUBLIC_DEMO=false` turns it off. To publish a LIVE version with a backend, deploy `server/` separately, then set `VITE_API_BASE_URL` and `VITE_PUBLIC_DEMO=false` in the hosting settings. **AI keys never go into the frontend.**

## 1. What QUTQAR AI is

QUTQAR AI ("qutqaru" is Kazakh for "to rescue") is a decision-support and training platform designed for the rescue services of the Republic of Kazakhstan. It helps with four jobs:

- understanding the operational picture: a map of incidents, forces and nationwide risk;
- preparing a commander's briefing from structured data;
- planning which available units to send;
- training commanders in a deterministic emergency simulator, with an instructor dashboard and printable training reports.

The interface is fully available in **Russian, Kazakh and English**, and is designed to run live in front of a commission, including **fully offline**.

## 2. Main features

| Area | What it does |
|---|---|
| **Operations overview** | Incident map of Kazakhstan with KPIs, incident feed, units at work and an AI situation analysis. |
| **AI Risk Center** | Fire, flood/mudflow, weather and hazardous-facility indices for all 17 regions and 3 cities of republican significance, with an interactive risk map, alerts and a region ranking. |
| **AI Operational Briefing** | Eight sections: situation, threats, people, weather, resources, priorities, information gaps, questions for the commander. Every item is tagged **DATA** (from structured data), **RULE-DERIVED**, or **UNKNOWN**. In LIVE mode the model may only add a narrative; the narrative is discarded if it contains numbers that are absent from the data. Incidents can be chosen from the list or entered manually. The briefing is printable. |
| **Resource Manager** | Register of fire engines, rescue vehicles, aerial ladders, water tankers, ambulances and drones, showing status, location, department and assignment. Includes filters and pagination. DEMO optimisation proposes the nearest *available* units per requirement, with ETA and a notional fuel cost in **₸ (KZT)**. Units arriving after 60 minutes are flagged as *remote reserve*. Plans are labelled **DEMO RECOMMENDATION — NOT AN OPERATIONAL COMMAND**. |
| **AI assistant** | Nine-section assessment. Each statement is tagged FACT / ASSUMPTION / RECOMMENDATION. Regulations are cited only from retrieved RAG fragments. |
| **Photo analysis** | Shows the original image with a toggleable AI detection overlay (boxes, confidence). Each hazard is classed **DETECTED / POSSIBLE / SIMULATED**, with "why it matters" and an uncertainty range. Eight hazard classes. |
| **Regulations (RAG)** | Upload documents (txt/md/pdf/docx) and get answers that cite source, document, section and clause/page. Citations are never invented. |
| **Incident analysis (AAR)** | Upload a report and get: timeline, decisions, delays, risks, communications, resources and lessons. Labelled as *analytical assistance, not an official investigation*. |
| **AI Emergency Simulator** | Seven scenarios, four difficulty levels, 3–5 training objectives per scenario, a live command interface, branching events, deterministic scoring and a full debrief. |
| **Instructor dashboard** | Trainee list, completed scenarios, average score, safety violations, average decision time, strongest/weakest category, scenario history. Filters by scenario, date, trainee and difficulty. CSV export. |
| **Reports** | A draft incident report, explicitly unofficial and numbered with a prototype draft ID (`QA-DRAFT-…`, not an MChS number). **QUTQAR AI — TRAINING REPORT**, with a report ID (`TR-…`) and a QR-style placeholder. Both are printable to PDF. |
| **Presentation mode** | Full-screen view for a large display: auto-cycling active incident, Kazakhstan map, AI analysis, risk levels, forces, recent events and system status. Keys: `← →`, `Space`, `F`, `Esc`. |

**Kazakhstan localization:**
- Administrative division after 2022: 17 regions and Astana, Almaty and Shymkent. Twenty-four cities are included.
- DEMO regional departments are listed by name only, with no contacts.
- Dates and times use Kazakhstan's single time zone, **UTC+5**. Formats are `23.09.2026`, `23 сентября 2026 г.` (RU), `2026 жылғы 23 қыркүйек` (KZ) and `23 September 2026` (EN).
- Money is shown in **₸** with Kazakh digit grouping.

## 3. Architecture

```
browser — React 18 + TypeScript + Vite + Tailwind + Leaflet (code-split per page)
   │  DEMO MODE on  → shared/engine/* runs in the browser; works without backend, AI API or internet
   │  DEMO MODE off → fetch /api/* (x-lang header = UI language)
   ▼
server/ — Node + Express + TypeScript   (AI keys live ONLY here)
   ├─ /api/ai/{situation,detailed,assistant,briefing,vision,kb-search,incident,report,simulate}
   ├─ /api/kb/documents      RAG store (extract → chunk → embed → vector search)
   ├─ /api/data/situation    operational data proxy (OPERATIONAL_DATA_URL)
   └─ /api/health
shared/
   ├─ contracts.ts   types shared by client and server
   ├─ i18n.ts        Lang, trilingual text type (L3), mandatory safety notice
   ├─ geo/kz.ts      reference geography of Kazakhstan (regions, cities, schematic outline)
   └─ engine/        deterministic engines: simulator, briefing, resources, vision, RAG, AAR, reports
src/i18n/           typed dictionary: every key is a [ru, kz, en] tuple → a missing translation is a compile error
```

**Response envelope.** Every AI answer is returned as `{ data, meta: { mode: demo|mock|live, provider, model, latencyMs, warnings[] } }`. The UI shows its origin as a badge: **DEMO · simulated**, **BACKEND · model not connected**, or **LIVE · model**.

**Performance measures:**
- Pages are loaded lazily.
- Maps render markers on a canvas.
- The per-second clocks are isolated components, so they do not re-render the rest of the page.
- Large lists are paginated, and the simulator log renders only the last 80 events.
- Object URLs for images are released after use, and image statistics are computed on a 160-px downscale.
- Animations are disabled when the system asks for reduced motion.

## 4. Demo mode

DEMO MODE is on by default and can be toggled in the header or in Settings.

**What changes in DEMO:**
- Every screen shows a striped banner and a watermark.
- All engines run in the browser.
- Fonts are bundled with the app.

**What still works offline:**
- The presentation keeps working if the backend is down, the AI API is unavailable, or there is no internet.
- If map tiles fail or hang (6 s timeout), the map shows an offline notice. Objects stay on top of a schematic outline of Kazakhstan.
- For a closed network, set `VITE_MAP_TILE_URL` to an internal tile server.

**In LIVE mode** demo data is **never** substituted:
- If the backend is down, you get an error.
- If no operational source is configured, you get an explicit empty state.
- If no model key is set, answers are clearly labelled mock.

**Language of engine content.** The simulator (industrial fire, steppe fire, debrief, objectives), the briefing, the resource planner, photo analysis and the situation analysis generate content in all three languages. Some DEMO engines produce Russian content, and the UI states this when KZ/EN is selected: the assistant, AAR, the incident-report template, the detailed analysis, and the narrative of the four smaller simulator scenarios. In LIVE mode the model is instructed to answer in the selected language.

## 5. AI architecture

- **Models:** any OpenAI-compatible endpoint (including self-hosted) or Anthropic. Configured with `AI_PROVIDER`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` and `AI_VISION_MODEL`. If no key is set, the backend answers with its rules engine and a warning.
- **Guardrails on the server:**
  - The system prompt forbids presenting the AI as an MChS authority, and forbids inventing laws, contacts or statistics.
  - Assistant regulations may reference only retrieved chunk IDs.
  - Knowledge-base answers must use valid `[n]` markers.
  - The report generator and the briefing reject any model text containing numbers absent from the input.
  - AAR findings need "line N" evidence.
  - Vision drops unknown classes.
- **Language:** the UI sends `x-lang: ru|kz|en`. The server appends a language instruction to every prompt.

## 6. Simulator engine

`shared/engine/simulator.ts` is a deterministic, seeded state machine.

- **The rules score; the AI only narrates.** The engine alone decides verdicts, branching events, success or failure, violations and all scores. In LIVE mode the model rewrites only the situation text, which the UI labels "does not affect the score".
- **Scenarios:**
  - **Industrial fire** (fully developed, fictional site; 22 decision types). Hidden facts: missing workers and their location, acetylene cylinders, a faulty hydrant. Limits: tank water and foam concentrate. Events: burning solvent spread by water streams, cylinder explosion, roof sag then collapse, adjacent warehouse ignition, flames near the gas regulator station, switchboard short-circuit, smoke over housing.
  - **Steppe fire** (fully developed; 17 decision types).
  - Building fire, flood, road accident, collapse and hazmat.
- **Difficulty** (Easy / Medium / Hard / Expert) changes the real time per simulated minute (20/15/12/10 s), the time limit, and how fast hazards develop. Expert also removes a starting unit.
- **Scoring:** six categories (tactics, safety, speed, resources, risk assessment, coordination). Penalties apply for violations, mistakes, casualties, timeouts and unmet objectives. Each objective is evaluated as achieved or not, with a reason. Scores are training scores only, never a qualification.
- **Commands:** buttons send engine action IDs, so they work in any language. Free-text commands are parsed with Russian, Kazakh and English keywords.

## 7. RAG architecture

1. Upload a document: txt, md, pdf (text layer) or docx.
2. Extract the text.
3. Chunk it, detecting pages and clauses.
4. Embed the chunks, remotely (`EMBEDDING_*`) or with local hash embeddings (demo quality).
5. Search the vector store with a similarity threshold (`RAG_MIN_SCORE`).
6. Generate an answer with `[n]` citations that are validated server-side.

Only documents uploaded with the *official* flag (protected by `KB_ADMIN_TOKEN`) count as official. Until such documents exist, answers state **"Официальный источник не подключен."** ("No official source is connected.")

## 8. Installation

```bash
npm install                 # frontend
npm run dev                 # http://localhost:5173 (proxies /api to :8787)

npm run server:install      # backend
cp server/.env.example server/.env   # optional: AI_API_KEY etc.
npm run server:dev          # http://localhost:8787

npm run typecheck:all       # type check: frontend + backend
npm run build               # production build → dist/ (Vite; type checking is a separate step so a deployment never fails on types)
npm run check               # type check + build together
```

Requirements: Node 18+. Fonts are shipped via `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-sans-condensed`, which cover Cyrillic including the Kazakh letters.

## 9. Deployment

- Build the frontend (`npm run build`) and the backend (`npm run server:build`). Then either serve `dist/` behind a reverse proxy that routes `/api` to the backend, or set `SERVE_STATIC=../dist`.
- Set `CORS_ORIGIN`, `KB_ADMIN_TOKEN` and `RATE_LIMIT_PER_MIN`. Keep `server/.env` out of version control.
- For a closed network, use an internal tile server (`VITE_MAP_TILE_URL`) and self-hosted OpenAI-compatible model and embedding endpoints.
- For a presentation, keep DEMO MODE on, open **Presentation mode**, press `F` for full screen, and use `←/→` to switch incidents.

## 10. Future integration with official MChS RK systems

Every integration below requires formal agreements, security accreditation and access granted by the relevant authorities. None are assumed.

- **Operational data:** implement `OPERATIONAL_DATA_URL` against an official dispatch / crisis-management feed, following the contract in `shared/contracts.ts` (incidents, units, weather, risk). The UI already handles connected, disconnected and error states.
- **Regulations:** load verified texts from the official legal database (e.g. the "Әділет" legal information system) with the *official* flag. Each citation then points to an official source.
- **Weather and hydrology:** feed official meteorological and hydrological observations into `weather` and the risk indices, in place of the DEMO values.
- **Identity and roles:** add authentication (for example, integration with a government identity provider), role-based access for dispatchers, commanders and instructors, and audit logs.
- **Training records:** move instructor sessions from `localStorage` to the server, replace the QR placeholder with a real QR code linked to a verification page, and export to the training institution's records system.
- **Models:** deploy models inside the government perimeter, and evaluate them on Kazakh-language and domain test sets before any operational use.

---

### Project layout

```
src/           React app: pages/, components/ (sim/, maps, ui), services/, data/ (DEMO only), i18n/
shared/        contracts, i18n primitives, Kazakhstan geography, deterministic engines
server/        Express backend: routes/, rag/, lib/, prompts.ts
```

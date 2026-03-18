# ⬡ NEXUS — AI Account Intelligence & Enrichment System

> Turn anonymous website visitors and bare company names into complete, sales-ready intelligence reports — automatically, using a parallel multi-agent AI pipeline.

![NEXUS Dashboard](https://img.shields.io/badge/status-live-22c55e?style=flat-square) ![DeepSeek](https://img.shields.io/badge/LLM-DeepSeek-6c63ff?style=flat-square) ![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688?style=flat-square) ![React](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61dafb?style=flat-square)

---

## The Problem

Sales and marketing teams are blind to who visits their website. An IP address and a list of pages tell you nothing actionable. And manually researching a list of company names takes hours per account.

**NEXUS solves both problems:**

| Input | Output |
|---|---|
| Visitor IP + page behavior | Company identity + buyer intent score |
| Bare company name | Full firmographic profile + tech stack + leadership |
| Either | AI summary + prioritized sales actions |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        NEXUS PIPELINE                       │
│                                                             │
│  INPUT                                                      │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │  Visitor Signal  │    │  Company Name    │              │
│  │  IP + pages +    │    │  (bare string)   │              │
│  │  dwell + visits  │    │                  │              │
│  └────────┬─────────┘    └────────┬─────────┘              │
│           └──────────┬───────────┘                         │
│                      ▼                                      │
│           ┌──────────────────────┐                         │
│           │   ORCHESTRATOR       │                         │
│           │   Routes & fans out  │                         │
│           └──────┬───────────────┘                         │
│                  │                                          │
│     ┌────────────┼────────────────┐                        │
│     ▼            ▼                ▼           ▼            │
│  ┌──────┐  ┌──────────┐  ┌───────────┐  ┌────────┐        │
│  │ ID   │  │ ENRICHER │  │  INTENT   │  │PERSONA │        │
│  │Agent │  │ Agent    │  │  Agent    │  │ Agent  │        │
│  └──┬───┘  └────┬─────┘  └─────┬─────┘  └───┬────┘        │
│     │           │               │             │             │
│  ip-api.com  Hunter.io      DeepSeek      DeepSeek         │
│              + scraper      reasoning     reasoning         │
│                  │                                          │
│     └────────────┴────────────────┴────────────┘           │
│                      ▼                                      │
│           ┌──────────────────────┐                         │
│           │   SYNTHESIZER        │                         │
│           │   AI summary +       │                         │
│           │   sales actions      │                         │
│           └──────────────────────┘                         │
│                      │                                      │
│                  SSE stream                                 │
│                      │                                      │
│           ┌──────────────────────┐                         │
│           │   React Dashboard    │                         │
│           │   Live agent panels  │                         │
│           └──────────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Parallel agents via `asyncio.gather`** — Agents 2, 3, and 4 (Enricher, Intent, Persona) run simultaneously rather than sequentially. This cuts total latency by ~3x vs a naive chain.

**SSE streaming** — The backend streams `AgentEvent` objects as each agent completes. The React UI updates each panel in real time — evaluators see the pipeline *thinking*, not just a final result.

**Data confidence scoring** — Every `CompanyProfile` carries a `confidence: float` (0.0–1.0) computed from how many independent sources agreed. Displayed in the UI.

**Enrichment waterfall** — Hunter.io API → web scraper fallback → LLM synthesis from partial data. The system never returns nothing.

**DeepSeek via OpenAI-compatible client** — All LLM calls use the same `chat_json()` utility, making model swaps trivial.

---

## Tech Stack

| Layer | Tech |
|---|---|
| LLM | DeepSeek Chat (via OpenAI-compatible API) |
| Backend | FastAPI + asyncio |
| Agent framework | PydanticAI-style typed agents (custom, lightweight) |
| Data sources | ip-api.com (free), Hunter.io (free tier), HTTP header scraping |
| Frontend | React 18 + Vite + TypeScript |
| Streaming | Server-Sent Events (SSE) |
| Deploy (backend) | Render (free tier) |
| Deploy (frontend) | Vercel (free) |

---

## Project Structure

```
nexus/
├── backend/
│   ├── main.py              # FastAPI app + SSE /api/enrich/stream endpoint
│   ├── models.py            # All Pydantic schemas (AccountIntelligence, etc.)
│   ├── llm.py               # DeepSeek client + chat_json() utility
│   ├── agents/
│   │   └── agents.py        # 5 specialist agents
│   ├── tools/
│   │   └── data_tools.py    # ip-api, Hunter.io, tech stack detector
│   ├── requirements.txt
│   ├── render.yaml
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.tsx           # Main layout + SSE consumer
    │   ├── App.css           # Design system (dark industrial theme)
    │   └── components/
    │       ├── InputPanel.tsx    # Visitor / company mode toggle
    │       ├── AgentCard.tsx     # Live per-agent status panel
    │       └── IntelReport.tsx   # Final intelligence report
    ├── package.json
    ├── vite.config.ts
    └── index.html
```

---

## Local Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- DeepSeek API key (get at [platform.deepseek.com](https://platform.deepseek.com))
- Hunter.io API key — optional, free at [hunter.io](https://hunter.io) (enriches company profiles)

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
cp .env.example .env
# Edit .env and add your DEEPSEEK_API_KEY

# Run
uvicorn main:app --reload --port 8000
```

API docs available at: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend

npm install

# Set backend URL (optional — defaults to localhost:8000)
echo "VITE_API_URL=http://localhost:8000" > .env

npm run dev
```

Open: `http://localhost:5173`

---

## API Reference

### `POST /api/enrich/stream`

SSE endpoint. Streams `AgentEvent` objects as each agent completes.

**Visitor mode:**
```json
{
  "mode": "visitor",
  "visitor": {
    "ip": "34.201.100.50",
    "pages_visited": ["/pricing", "/ai-sales-agent", "/case-studies"],
    "time_on_site_seconds": 222,
    "visits_this_week": 3,
    "referral_source": "linkedin"
  }
}
```

**Company mode:**
```json
{
  "mode": "company",
  "company_names": ["BrightPath Lending"]
}
```

**SSE event stream:**
```
data: {"agent":"identifier","status":"running","data":null}
data: {"agent":"identifier","status":"done","data":{"name":"Acme Corp",...}}
data: {"agent":"enricher","status":"running","data":null}
data: {"agent":"intent","status":"running","data":null}
data: {"agent":"persona","status":"running","data":null}
data: {"agent":"enricher","status":"done","data":{...}}
data: {"agent":"intent","status":"done","data":{"score":8.4,"stage":"Evaluation",...}}
data: {"agent":"persona","status":"done","data":{"likely_role":"VP of Sales Operations",...}}
data: {"agent":"synthesis","status":"running","data":null}
data: {"agent":"synthesis","status":"done","data":{...}}
data: {"agent":"complete","status":"done","data":{full AccountIntelligence object}}
```

---

## Deployment

### Backend → Render (Free)

1. Push to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo, set root to `backend/`
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Add env vars: `DEEPSEEK_API_KEY`, `HUNTER_API_KEY`
7. Deploy — you get a free `*.onrender.com` URL

### Frontend → Vercel (Free)

```bash
cd frontend
npx vercel

# When prompted:
# Root: frontend/
# Framework: Vite
# Add env var: VITE_API_URL = https://your-backend.onrender.com
```

Or connect GitHub repo at [vercel.com](https://vercel.com) and set the env var in the dashboard.

---

## Example Output

```
Company:     Acme Mortgage
Domain:      acmemortgage.com
Industry:    Mortgage Lending
Size:        200-1000 employees
HQ:          Austin, Texas, USA
Founded:     2008

Tech Stack:
  CRM:       Salesforce
  Marketing: HubSpot
  Analytics: Google Analytics
  Platform:  WordPress

Likely Persona:  VP of Sales Operations
Confidence:      74%
Reasoning:       Pricing + case study visits indicate budget authority

Intent Score:    8.4 / 10
Stage:           Evaluation
Signals:
  → 3 visits to /pricing this week
  → Read /case-studies (ROI validation behavior)
  → 3m 42s dwell — engaged, not bouncing

AI Summary:
  Acme Mortgage is a mid-market lender operating in Texas with strong
  Salesforce/HubSpot adoption. Their repeated visits to pricing and case
  studies over 3 sessions this week signal active evaluation of an AI
  sales tool. High dwell time suggests a senior buyer validating ROI.

Recommended Actions:
  [HIGH]   Connect on LinkedIn with their VP of Sales or RevOps lead
  [HIGH]   Send personalized outreach referencing mortgage industry case studies  
  [MEDIUM] Add to 5-touch outbound sequence — reference AI+Salesforce integration angle
```

---

## What We Built vs What Evaluators See

| What evaluators care about | How NEXUS delivers it |
|---|---|
| System design & architecture | Parallel multi-agent pipeline with typed Pydantic outputs at every stage |
| Use of AI agents & LLM workflows | 5 specialist agents, each with a focused system prompt and structured JSON output |
| Handling messy real-world data | Enrichment waterfall: Hunter → scraper → LLM. Confidence scoring on all fields. |
| Structured outputs & reasoning | Every output is a Pydantic model. Reasoning field on intent + persona agents. |
| Creativity & builder mindset | Dual input mode, SSE streaming, live pipeline visualization in the UI |
| Working end-to-end prototype | Fully deployed: Render (backend) + Vercel (frontend) |

---

Built in 13 hours for the Fello AI Builder Hackathon.

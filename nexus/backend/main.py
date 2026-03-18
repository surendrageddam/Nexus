import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from models import EnrichRequest, AccountIntelligence, AgentEvent, TechStack, CompanyProfile
from agents.agents import (
    run_identifier, run_enricher,
    run_intent_scorer, run_persona_agent, run_synthesizer,
)

app = FastAPI(title="NEXUS — AI Account Intelligence", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def sse_event(event: AgentEvent) -> str:
    return f"data: {event.model_dump_json()}\n\n"


async def _single_pipeline(visitor, company_name):
    """Run the full 5-agent pipeline for one company/visitor. Yields SSE events."""

    # ── AGENT 1: Identifier ──────────────────────────────
    yield sse_event(AgentEvent(agent="identifier", status="running"))
    try:
        company = await run_identifier(visitor=visitor, company_name=company_name)
        yield sse_event(AgentEvent(
            agent="identifier",
            status="done",
            data=company.model_dump(),
        ))
    except Exception as e:
        yield sse_event(AgentEvent(agent="identifier", status="error", error=str(e)))
        company = CompanyProfile(name=company_name or "Unknown", confidence=0.0)

    # ── AGENTS 2-4: Parallel enrichment ─────────────────
    yield sse_event(AgentEvent(agent="enricher", status="running"))
    yield sse_event(AgentEvent(agent="intent", status="running"))
    yield sse_event(AgentEvent(agent="persona", status="running"))

    try:
        enricher_result, intent_result, persona_result = await asyncio.gather(
            run_enricher(company),
            run_intent_scorer(visitor, company),
            run_persona_agent(visitor, company),
        )

        enriched_profile = enricher_result["profile"]
        tech_stack = enricher_result["tech_stack"]
        leadership = enricher_result["leadership"]
        business_signals = enricher_result["business_signals"]
        logo_url = enricher_result.get("logo_url")

        yield sse_event(AgentEvent(
            agent="enricher",
            status="done",
            data={
                "profile": enriched_profile.model_dump(),
                "tech_stack": tech_stack.model_dump(),
                "leadership": [l.model_dump() for l in leadership],
                "business_signals": [s.model_dump() for s in business_signals],
                "logo_url": logo_url,
            },
        ))
        yield sse_event(AgentEvent(agent="intent", status="done", data=intent_result.model_dump()))
        yield sse_event(AgentEvent(agent="persona", status="done", data=persona_result.model_dump()))

    except Exception as e:
        for agent in ["enricher", "intent", "persona"]:
            yield sse_event(AgentEvent(agent=agent, status="error", error=str(e)))
        enriched_profile = company
        tech_stack = TechStack()
        leadership = []
        business_signals = []
        intent_result = None
        persona_result = None

    # ── Build intel object ───────────────────────────────
    intel = AccountIntelligence(
        company=enriched_profile,
        tech_stack=tech_stack,
        persona=persona_result,
        intent=intent_result,
        leadership=leadership,
        business_signals=business_signals,
        logo_url=logo_url if 'logo_url' in dir() else None,
    )

    # ── AGENT 5: Synthesizer ─────────────────────────────
    yield sse_event(AgentEvent(agent="synthesis", status="running"))
    try:
        synth = await run_synthesizer(intel)
        intel.ai_summary = synth["ai_summary"]
        intel.recommended_actions = synth["recommended_actions"]

        yield sse_event(AgentEvent(
            agent="synthesis",
            status="done",
            data={
                "ai_summary": intel.ai_summary,
                "recommended_actions": [a.model_dump() for a in intel.recommended_actions],
            },
        ))
    except Exception as e:
        yield sse_event(AgentEvent(agent="synthesis", status="error", error=str(e)))

    # ── Final complete event (full intel object) ─────────
    yield sse_event(AgentEvent(
        agent="complete",
        status="done",
        data=intel.model_dump(),
    ))


async def run_pipeline(req: EnrichRequest):
    """
    Outer pipeline generator.
    - Visitor mode: single run with IP signal
    - Company mode: batch — runs full pipeline for EACH company in the list
    """
    visitor = req.visitor if req.mode == "visitor" else None

    if visitor or not req.company_names:
        # Single visitor run
        async for event in _single_pipeline(visitor, None):
            yield event
    else:
        # Batch: one full pipeline per company
        total = len(req.company_names)
        for idx, company_name in enumerate(req.company_names):
            # Emit batch progress so frontend can show "2 of 5"
            yield sse_event(AgentEvent(
                agent="batch",
                status="running",
                data={"current": idx + 1, "total": total, "company": company_name},
            ))
            async for event in _single_pipeline(None, company_name):
                yield event


@app.post("/api/enrich/stream")
async def enrich_stream(req: EnrichRequest):
    """SSE endpoint — streams AgentEvent objects as each agent completes."""
    return StreamingResponse(
        run_pipeline(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "NEXUS"}


@app.get("/")
async def root():
    return {"message": "NEXUS AI Account Intelligence API", "docs": "/docs"}


# ── Simulated visitor dataset ─────────────────────────
import random
from datetime import datetime, timedelta
from models import SimulatedVisitor

_COMPANIES = [
    {"company": "Rocket Mortgage", "industry": "Mortgage Lending", "domain": "rocketmortgage.com"},
    {"company": "BrightPath Lending", "industry": "Financial Services", "domain": "brightpathlending.com"},
    {"company": "Redfin", "industry": "Real Estate Tech", "domain": "redfin.com"},
    {"company": "Compass Real Estate", "industry": "Real Estate", "domain": "compass.com"},
    {"company": "Summit Realty Group", "industry": "Real Estate", "domain": "summitrealty.com"},
    {"company": "LoanDepot", "industry": "Mortgage Lending", "domain": "loandepot.com"},
    {"company": "Zillow", "industry": "Real Estate Tech", "domain": "zillow.com"},
    {"company": "Better.com", "industry": "Fintech Mortgage", "domain": "better.com"},
    {"company": "HomeLight", "industry": "Real Estate Tech", "domain": "homelight.com"},
    {"company": "Axtria", "industry": "Life Sciences Analytics", "domain": "axtria.com"},
]

_PAGE_COMBOS = [
    {"pages": ["/pricing", "/ai-sales-agent", "/case-studies"], "score": 8.7, "stage": "Decision"},
    {"pages": ["/pricing", "/demo"], "score": 9.2, "stage": "Decision"},
    {"pages": ["/case-studies", "/pricing"], "score": 7.8, "stage": "Evaluation"},
    {"pages": ["/ai-sales-agent", "/integrations", "/pricing"], "score": 8.1, "stage": "Evaluation"},
    {"pages": ["/blog", "/case-studies"], "score": 4.5, "stage": "Research"},
    {"pages": ["/docs", "/api"], "score": 3.8, "stage": "Research"},
    {"pages": ["/blog"], "score": 2.1, "stage": "Awareness"},
    {"pages": ["/case-studies", "/integrations"], "score": 6.2, "stage": "Evaluation"},
]

_PERSONAS = [
    "VP of Sales Operations", "Head of RevOps", "Director of Marketing",
    "Chief Revenue Officer", "Sales Enablement Manager", "Growth Lead",
    "Business Development VP", "Head of Demand Generation",
]

_REFERRERS = ["linkedin", "google", "direct", "email-campaign", "g2.com", "twitter"]
_DEVICES = ["Desktop", "Desktop", "Desktop", "Mobile", "Tablet"]
_LOCATIONS = [
    "New York, USA", "San Francisco, USA", "Chicago, USA",
    "Austin, USA", "Boston, USA", "Seattle, USA", "Miami, USA",
]

_IPS = [
    "34.201.100.50", "52.14.230.12", "18.191.45.67", "35.162.80.23",
    "54.219.170.45", "3.82.190.15", "13.57.220.88", "52.90.145.33",
]


def _generate_visitor(idx: int) -> SimulatedVisitor:
    co = random.choice(_COMPANIES)
    combo = random.choice(_PAGE_COMBOS)
    score = round(min(combo["score"] + random.uniform(-0.4, 0.4), 10.0), 1)
    ts = datetime.utcnow() - timedelta(seconds=random.randint(60, 86400))
    return SimulatedVisitor(
        visitor_id=f"V{idx:03d}",
        ip=random.choice(_IPS),
        company=co["company"],
        industry=co["industry"],
        domain=co["domain"],
        pages_visited=combo["pages"],
        time_on_site_seconds=random.randint(60, 480),
        visits_this_week=random.randint(1, 5),
        referral_source=random.choice(_REFERRERS),
        device=random.choice(_DEVICES),
        location=random.choice(_LOCATIONS),
        timestamp=ts.isoformat() + "Z",
        intent_score=score,
        intent_stage=combo["stage"],
        persona=random.choice(_PERSONAS),
    )


# Seed 20 visitors once at startup
random.seed(42)
_VISITOR_DATASET: list[SimulatedVisitor] = [_generate_visitor(i + 1) for i in range(20)]
random.seed()  # restore randomness


@app.get("/api/visitors")
async def get_visitors():
    """Returns the simulated visitor dataset for the analytics dashboard."""
    return {"visitors": [v.model_dump() for v in _VISITOR_DATASET]}


@app.get("/api/visitors/stats")
async def get_visitor_stats():
    """Aggregated stats over the simulated dataset."""
    visitors = _VISITOR_DATASET
    stages: dict[str, int] = {}
    pages: dict[str, int] = {}
    companies: dict[str, dict] = {}

    for v in visitors:
        stages[v.intent_stage] = stages.get(v.intent_stage, 0) + 1
        for p in v.pages_visited:
            pages[p] = pages.get(p, 0) + 1
        if v.company not in companies:
            companies[v.company] = {"count": 0, "max_score": 0.0, "industry": v.industry}
        companies[v.company]["count"] += 1
        companies[v.company]["max_score"] = max(companies[v.company]["max_score"], v.intent_score)

    avg_score = round(sum(v.intent_score for v in visitors) / len(visitors), 1)
    high_intent = sum(1 for v in visitors if v.intent_score >= 8)

    return {
        "total_visitors": len(visitors),
        "avg_intent_score": avg_score,
        "high_intent_count": high_intent,
        "stage_breakdown": stages,
        "top_pages": sorted(pages.items(), key=lambda x: -x[1])[:8],
        "top_companies": sorted(
            [{"name": k, **v} for k, v in companies.items()],
            key=lambda x: -x["max_score"]
        )[:6],
    }


# ── Ask agent endpoint ────────────────────────────────
from pydantic import BaseModel as _BM

class AskRequest(_BM):
    question: str
    context: str


@app.post("/api/ask")
async def ask_agent(req: AskRequest):
    """
    Answers questions about an account using the full intel context.
    Responds in concise markdown format.
    """
    from llm import make_client, chat
    client = make_client()

    answer = chat(
        client,
        system="""You are a senior B2B sales intelligence analyst embedded inside the NEXUS platform.
You have been given the full intelligence report for a specific account.
Answer the user's question about this account concisely and helpfully.

RULES:
- Respond in markdown format (use **bold**, bullet points, inline `code` where relevant)
- Be concise — 3-6 sentences max, or a short bullet list
- Be specific — reference actual data from the context (company name, score, signals)
- If the answer isn't in the context, say so honestly
- Do NOT repeat the full context back — just answer the question
- Tone: confident, direct, like a seasoned sales analyst briefing an AE""",
        user=f"{req.context}\n\n---\n\nUser question: {req.question}",
        temperature=0.4,
    )

    return {"answer": answer}
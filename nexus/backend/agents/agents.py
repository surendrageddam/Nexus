"""
All specialist agents for NEXUS.
Each agent is an async function that takes context and returns a typed Pydantic model.
DeepSeek powers all reasoning via the shared llm module.
"""
import asyncio
import os
import sys
from typing import Optional

# Ensure backend/ root is on sys.path so sibling modules (llm, models, tools) resolve
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from llm import make_client, chat_json
from models import (
    CompanyProfile, PersonaSignal, IntentScore, IntentStage,
    TechStack, LeadershipContact, BusinessSignal, SalesAction,
    AccountIntelligence, VisitorSignal,
)
from tools.data_tools import (
    ip_to_company, hunter_company_enrichment,
    detect_tech_stack, guess_domain_from_name,
    abstract_enrich, wikipedia_lookup, get_logo_url, merge_company_data,
)


# ─────────────────────────────────────────────
# AGENT 1 — IDENTIFIER
# ─────────────────────────────────────────────
async def run_identifier(
    visitor: Optional[VisitorSignal] = None,
    company_name: Optional[str] = None,
) -> CompanyProfile:
    client = make_client()

    if visitor and visitor.ip:
        ip_data = await ip_to_company(visitor.ip)
        org_hint = ip_data.get("org", "") or ip_data.get("isp", "")
        geo = f"{ip_data.get('city', '')}, {ip_data.get('country', '')}".strip(", ")

        # If user provided a company hint alongside IP, use it — it's more reliable than reverse IP
        hint = visitor.company_name_hint if visitor else None

        result = chat_json(
            client,
            system="""You are a B2B sales intelligence expert. Identify the company behind a website visitor.
You have: an IP geolocation org name, optional company name hint from the user, and pages visited.
The company name hint (if provided) is highly reliable — prioritize it over the IP org name.
Return JSON: {"name": str, "domain": str, "industry": str, "headquarters": str, "confidence": float}
If org_hint looks like a cloud/hosting provider (AWS, Azure, Google, Cloudflare) AND no hint given, set confidence to 0.3.""",
            user=f"IP org: '{org_hint}'\nCompany hint (if provided): '{hint or 'none'}'\nGeo: {geo}\nPages visited: {visitor.pages_visited if visitor else []}",
        )
        return CompanyProfile(
            name=result.get("name", hint or org_hint or "Unknown"),
            domain=result.get("domain"),
            industry=result.get("industry"),
            headquarters=result.get("headquarters", geo),
            confidence=float(result.get("confidence", 0.5)),
        )

    elif company_name:
        domain = await guess_domain_from_name(company_name)
        result = chat_json(
            client,
            system="""You are a B2B research analyst. Given a company name, infer their domain, industry, and HQ.
Return JSON: {"name": str, "domain": str, "industry": str, "headquarters": str, "confidence": float}""",
            user=f"Company name: '{company_name}'\nLikely domain guess: '{domain}'",
        )
        return CompanyProfile(
            name=result.get("name", company_name),
            domain=result.get("domain", domain),
            industry=result.get("industry"),
            headquarters=result.get("headquarters"),
            confidence=float(result.get("confidence", 0.7)),
        )

    return CompanyProfile(name="Unknown", confidence=0.0)


# ─────────────────────────────────────────────
# AGENT 2 — ENRICHER
# Sources: Hunter → AbstractAPI → Wikipedia → LLM fallback
# All run in parallel, merged with first-non-null priority
# ─────────────────────────────────────────────
async def run_enricher(company: CompanyProfile) -> dict:
    client = make_client()
    domain = company.domain or ""
    hunter_key = os.getenv("HUNTER_API_KEY", "")
    abstract_key = os.getenv("ABSTRACT_API_KEY", "")

    async def empty_dict():
        return {}

    # Run all data sources in parallel
    hunter_data, abstract_data, wiki_data, tech_raw = await asyncio.gather(
        hunter_company_enrichment(domain, hunter_key),
        abstract_enrich(domain, abstract_key),
        wikipedia_lookup(company.name),
        detect_tech_stack(domain) if domain else empty_dict(),
    )

    # Merge real data sources — first non-null wins
    real_data = merge_company_data(hunter_data, abstract_data, wiki_data)

    # Only call LLM for fields still missing after real data sources
    missing_fields = [f for f in ["size", "description", "founded_year", "headquarters", "industry"]
                      if not real_data.get(f) and not getattr(company, f, None)]
    needs_llm = len(missing_fields) > 0

    if needs_llm:
        llm_enrich = chat_json(
            client,
            system=f"""You are a B2B market researcher. Fill in ONLY these missing fields for the company.
Missing fields needed: {missing_fields}
Return JSON with ONLY these keys (skip any you are not confident about):
{{
  "size": "X-Y employees" or null,
  "description": "2 sentences" or null,
  "founded_year": "YYYY" or null,
  "headquarters": "City, Country" or null,
  "industry": str or null,
  "leadership": [{{"title": str, "name": str or null}}]
}}
IMPORTANT: Only include "leadership" with real known names. If unsure of a name, set name to null.
Do NOT guess employee counts or founding years. Only return what you know with high confidence.""",
            user=f"Company: {company.name}\nDomain: {domain}\nKnown industry: {company.industry or real_data.get('industry', 'unknown')}\nKnown description: {real_data.get('description', 'none')}",
        )
    else:
        llm_enrich = {}

    # Final merged profile — real data > LLM > original identifier data
    all_sources = merge_company_data(real_data, llm_enrich, {
        "industry": company.industry,
        "headquarters": company.headquarters,
    })

    # Build confidence score based on how many real sources contributed
    source_count = sum([bool(hunter_data), bool(abstract_data), bool(wiki_data)])
    confidence = min(company.confidence + (source_count * 0.1), 1.0)

    enriched_profile = CompanyProfile(
        name=company.name,
        domain=domain or all_sources.get("domain"),
        industry=all_sources.get("industry"),
        size=all_sources.get("size"),
        headquarters=all_sources.get("city") or all_sources.get("headquarters"),
        founded_year=all_sources.get("founded_year"),
        description=all_sources.get("description"),
        confidence=confidence,
    )

    tech_stack = TechStack(
        crm=tech_raw.get("crm"),
        marketing=tech_raw.get("marketing"),
        analytics=tech_raw.get("analytics"),
        platform=tech_raw.get("platform"),
        other=tech_raw.get("other", []),
    )

    # Leadership — only include entries that have actual data
    leadership_raw = llm_enrich.get("leadership", [])
    leadership = [
        LeadershipContact(title=l.get("title", ""), name=l.get("name") or None)
        for l in leadership_raw[:4]
        if l.get("title")  # only include if at least title exists
    ]

    # Business signals
    signals_raw = chat_json(
        client,
        system="""Identify 2-3 specific business signals for this company based on what you know.
Return JSON: {"signals": [{"signal_type": str, "description": str}]}
Signal types: hiring_growth, funding, market_expansion, product_launch, digital_transformation
Only include signals you can justify from the company data provided.""",
        user=f"Company: {company.name}, Industry: {all_sources.get('industry', company.industry)}, Size: {enriched_profile.size}, Description: {enriched_profile.description or 'N/A'}",
    )
    business_signals = [
        BusinessSignal(signal_type=s.get("signal_type", ""), description=s.get("description", ""))
        for s in signals_raw.get("signals", [])
        if s.get("signal_type") and s.get("description")
    ]

    return {
        "profile": enriched_profile,
        "tech_stack": tech_stack,
        "leadership": leadership,
        "business_signals": business_signals,
        "logo_url": get_logo_url(domain),
    }


# ─────────────────────────────────────────────
# AGENT 3 — INTENT SCORER
# ─────────────────────────────────────────────
async def run_intent_scorer(
    visitor: Optional[VisitorSignal],
    company: CompanyProfile,
) -> IntentScore:
    client = make_client()

    if not visitor:
        return IntentScore(
            score=5.0,
            stage=IntentStage.RESEARCH,
            signals=["No visitor data — company list input"],
            reasoning="Baseline score assigned for company list enrichment mode.",
        )

    result = chat_json(
        client,
        system="""You are a B2B intent scoring specialist. Score purchase intent 0-10 using these EXACT rules:

PAGE SCORES (additive):
- /pricing visited = +2.5 points
- /case-studies visited = +1.5 points
- /demo or /contact visited = +3.0 points
- /ai-sales-agent or /product visited = +1.0 points
- /docs or /api visited = +0.5 points
- /blog visited = +0.3 points

BEHAVIORAL MULTIPLIERS:
- visits_this_week >= 3 = +2.0 points (strong repeat interest)
- visits_this_week == 2 = +1.0 points
- dwell_seconds > 180 = +1.0 points
- referral from linkedin or email = +0.5 points

STAGES: Awareness(0-3), Research(3-5), Evaluation(5-8), Decision(8-10)

IMPORTANT: Calculate the score numerically by adding up the applicable rules above.
Do NOT return a low score if the pages visited clearly indicate buyer intent.
/pricing + /case-studies + 3 visits/week + 222s dwell should score approximately 8.5.

Return JSON: {"score": float, "stage": str, "signals": [str, str, str], "reasoning": str}""",
        user=f"""Pages: {visitor.pages_visited}
Dwell: {visitor.time_on_site_seconds}s
Visits/week: {visitor.visits_this_week}
Company: {company.name}
Device: {visitor.device or 'unknown'}
Location: {visitor.location or 'unknown'}
Referral: {visitor.referral_source or 'unknown'}
Visitor ID: {visitor.visitor_id or 'anonymous'}""",
    )

    return IntentScore(
        score=min(float(result.get("score", 5.0)), 10.0),
        stage=IntentStage(result.get("stage", "Research")),
        signals=result.get("signals", []),
        reasoning=result.get("reasoning", ""),
    )


# ─────────────────────────────────────────────
# AGENT 4 — PERSONA INFERENCE
# ─────────────────────────────────────────────
async def run_persona_agent(
    visitor: Optional[VisitorSignal],
    company: CompanyProfile,
) -> PersonaSignal:
    client = make_client()

    if not visitor:
        return PersonaSignal(
            likely_role="Business Decision Maker",
            department="Executive",
            seniority="Senior",
            confidence=0.4,
            reasoning="No visitor data available.",
        )

    result = chat_json(
        client,
        system="""Infer B2B buyer persona from web behavior.
/pricing → budget holder VP+, /docs → technical evaluator, /case-studies → decision maker,
/blog → researcher, /demo → sales-engaged buyer, /integrations → RevOps

Return JSON: {
  "likely_role": str,
  "department": str,
  "seniority": str,
  "confidence": float,
  "reasoning": str
}""",
        user=f"Pages: {visitor.pages_visited}\nDwell: {visitor.time_on_site_seconds}s\nVisits/week: {visitor.visits_this_week}\nIndustry: {company.industry}",
    )

    return PersonaSignal(
        likely_role=result.get("likely_role", "Unknown"),
        department=result.get("department", "Unknown"),
        seniority=result.get("seniority", "Mid"),
        confidence=float(result.get("confidence", 0.5)),
        reasoning=result.get("reasoning", ""),
    )


# ─────────────────────────────────────────────
# AGENT 5 — SYNTHESIZER
# ─────────────────────────────────────────────
async def run_synthesizer(intel: AccountIntelligence) -> dict:
    client = make_client()

    company = intel.company
    persona = intel.persona
    intent = intel.intent
    tech = intel.tech_stack
    signals = intel.business_signals

    tech_summary = ", ".join(filter(None, [
        tech.crm, tech.marketing, tech.analytics, tech.platform, *tech.other[:2]
    ])) or "Not detected"

    result = chat_json(
        client,
        system="""You are a senior B2B sales strategist working at an AI sales intelligence company.
Your job is to help YOUR sales team win this company as a customer.

CRITICAL RULES:
- Actions must be about YOUR TEAM reaching out TO this company to sell them YOUR product
- NEVER suggest the company buy tools they already use (e.g. don't say "sell them Cloudflare" if they use Cloudflare)
- Focus on: who to contact, what angle to use, what content to send, which channel to use
- Reference their industry, size, growth signals, and detected persona in your reasoning
- The AI summary should read like a sales brief handed to an AE before a call

Return JSON: {
  "ai_summary": str (3-4 sentences — who is this company, what is their situation, why should YOUR team care right now),
  "recommended_actions": [{"priority": "HIGH"|"MEDIUM"|"LOW", "action": str, "rationale": str}]
}
Generate exactly 3 actions ordered HIGH to MEDIUM to LOW.""",
        user=f"""Account to win: {company.name}
Industry: {company.industry} | Size: {company.size} | HQ: {company.headquarters}
Their tech stack: {tech_summary}
Likely buyer persona: {persona.likely_role if persona else 'Unknown'} ({f'{persona.confidence:.0%} confidence' if persona else '?'})
Intent score: {intent.score if intent else 'N/A'}/10 — Stage: {intent.stage if intent else 'Unknown'}
Behavioral signals: {intent.signals if intent else []}
Business signals: {[s.description for s in signals]}
Company description: {company.description or 'N/A'}""",
    )

    return {
        "ai_summary": result.get("ai_summary", ""),
        "recommended_actions": [
            SalesAction(
                priority=a.get("priority", "MEDIUM"),
                action=a.get("action", ""),
                rationale=a.get("rationale", ""),
            )
            for a in result.get("recommended_actions", [])
        ],
    }
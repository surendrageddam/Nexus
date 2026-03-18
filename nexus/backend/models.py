from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class IntentStage(str, Enum):
    AWARENESS = "Awareness"
    RESEARCH = "Research"
    EVALUATION = "Evaluation"
    DECISION = "Decision"


class TechStack(BaseModel):
    crm: Optional[str] = None
    marketing: Optional[str] = None
    analytics: Optional[str] = None
    platform: Optional[str] = None
    other: list[str] = Field(default_factory=list)


class CompanyProfile(BaseModel):
    name: str
    domain: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None
    headquarters: Optional[str] = None
    founded_year: Optional[str] = None
    description: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class PersonaSignal(BaseModel):
    likely_role: str
    department: str
    seniority: str
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str


class IntentScore(BaseModel):
    score: float = Field(ge=0.0, le=10.0)
    stage: IntentStage
    signals: list[str]
    reasoning: str


class LeadershipContact(BaseModel):
    name: Optional[str] = None
    title: str
    linkedin_hint: Optional[str] = None


class BusinessSignal(BaseModel):
    signal_type: str
    description: str


class SalesAction(BaseModel):
    priority: str  # HIGH / MEDIUM / LOW
    action: str
    rationale: str


class AccountIntelligence(BaseModel):
    company: CompanyProfile
    tech_stack: TechStack = Field(default_factory=TechStack)
    persona: Optional[PersonaSignal] = None
    intent: Optional[IntentScore] = None
    leadership: list[LeadershipContact] = Field(default_factory=list)
    business_signals: list[BusinessSignal] = Field(default_factory=list)
    ai_summary: str = ""
    recommended_actions: list[SalesAction] = Field(default_factory=list)
    logo_url: Optional[str] = None


class AgentEvent(BaseModel):
    agent: str
    status: str
    data: Optional[dict] = None
    error: Optional[str] = None


# ── Unified visitor signal — all fields optional ──────
# IP and company_name_hint can be provided together or separately.
# The system uses whichever is available.
class VisitorSignal(BaseModel):
    visitor_id: Optional[str] = None          # e.g. "V001"
    ip: Optional[str] = None                  # e.g. "34.201.100.50"
    company_name_hint: Optional[str] = None   # optional hint alongside IP
    pages_visited: list[str] = Field(default_factory=list)
    time_on_site_seconds: Optional[int] = None
    visits_this_week: Optional[int] = None
    referral_source: Optional[str] = None
    device: Optional[str] = None              # "Desktop" | "Mobile" | "Tablet"
    location: Optional[str] = None            # "City, Country" from metadata
    timestamp: Optional[str] = None           # ISO string e.g. "2024-01-15T14:30:00Z"


# ── Unified request ───────────────────────────────────
# mode="visitor": use visitor signal (IP + optional company hint + behavior)
# mode="company": use company_names list (no behavior signals)
class EnrichRequest(BaseModel):
    mode: str = "visitor"
    visitor: Optional[VisitorSignal] = None
    company_names: list[str] = Field(default_factory=list)


# ── Simulated visitor record (for analytics endpoint) ─
class SimulatedVisitor(BaseModel):
    visitor_id: str
    ip: str
    company: str
    industry: str
    domain: str
    pages_visited: list[str]
    time_on_site_seconds: int
    visits_this_week: int
    referral_source: str
    device: str
    location: str
    timestamp: str
    intent_score: float
    intent_stage: str
    persona: str
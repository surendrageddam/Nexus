import { useState, useEffect, useRef } from "react";

interface Visitor {
    visitor_id: string;
    ip: string;
    company: string;
    industry: string;
    domain: string;
    pages_visited: string[];
    time_on_site_seconds: number;
    visits_this_week: number;
    referral_source: string;
    device: string;
    location: string;
    timestamp: string;
    intent_score: number;
    intent_stage: string;
    persona: string;
}

interface Stats {
    total_visitors: number;
    avg_intent_score: number;
    high_intent_count: number;
    stage_breakdown: Record<string, number>;
    top_pages: [string, number][];
    top_companies: { name: string; count: number; max_score: number; industry: string }[];
}

// ── Extra simulated visitors that trickle in live ─────
const LIVE_EXTRAS = [
    { company: "Rocket Mortgage", industry: "Mortgage Lending", domain: "rocketmortgage.com" },
    { company: "Redfin", industry: "Real Estate Tech", domain: "redfin.com" },
    { company: "Better.com", industry: "Fintech Mortgage", domain: "better.com" },
    { company: "HomeLight", industry: "Real Estate Tech", domain: "homelight.com" },
    { company: "Compass Real Estate", industry: "Real Estate", domain: "compass.com" },
];
const LIVE_COMBOS = [
    { pages: ["/pricing", "/demo"], score: 9.1, stage: "Decision" },
    { pages: ["/case-studies", "/pricing"], score: 7.6, stage: "Evaluation" },
    { pages: ["/blog", "/case-studies"], score: 4.3, stage: "Research" },
    { pages: ["/ai-sales-agent", "/integrations"], score: 6.5, stage: "Evaluation" },
];
const PERSONAS = ["VP of Sales Operations", "Head of RevOps", "Director of Marketing", "Growth Lead"];
let _liveCounter = 100;

function generateLiveVisitor(): Visitor {
    const co = LIVE_EXTRAS[Math.floor(Math.random() * LIVE_EXTRAS.length)];
    const combo = LIVE_COMBOS[Math.floor(Math.random() * LIVE_COMBOS.length)];
    const score = Math.round((combo.score + (Math.random() - 0.5) * 0.6) * 10) / 10;
    return {
        visitor_id: `V${++_liveCounter}`,
        ip: `34.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        company: co.company, industry: co.industry, domain: co.domain,
        pages_visited: combo.pages,
        time_on_site_seconds: Math.floor(Math.random() * 300) + 60,
        visits_this_week: Math.floor(Math.random() * 4) + 1,
        referral_source: ["linkedin", "google", "direct", "email-campaign"][Math.floor(Math.random() * 4)],
        device: ["Desktop", "Desktop", "Mobile"][Math.floor(Math.random() * 3)],
        location: ["New York, USA", "San Francisco, USA", "Chicago, USA"][Math.floor(Math.random() * 3)],
        timestamp: new Date().toISOString(),
        intent_score: Math.min(score, 10),
        intent_stage: combo.stage,
        persona: PERSONAS[Math.floor(Math.random() * PERSONAS.length)],
    };
}

function scoreColor(s: number) {
    return s >= 8 ? "#00C48C" : s >= 5 ? "#ff9800" : "#f44336";
}

function stagePill(stage: string) {
    const map: Record<string, { bg: string; color: string }> = {
        Decision: { bg: "rgba(0,196,140,0.12)", color: "#00C48C" },
        Evaluation: { bg: "rgba(41,121,255,0.10)", color: "#2979ff" },
        Research: { bg: "rgba(255,152,0,0.10)", color: "#ff9800" },
        Awareness: { bg: "rgba(150,150,150,0.10)", color: "#888" },
    };
    return map[stage] || map.Awareness;
}

function timeAgo(iso: string) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}

export default function AnalyticsPage({ theme, onRunPipeline }: {
    theme: "dark" | "light";
    onRunPipeline?: (visitor: Visitor) => void;
}) {
    const [visitors, setVisitors] = useState<Visitor[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Visitor | null>(null);
    const [newIds, setNewIds] = useState<Set<string>>(new Set());
    const counterRef = useRef(0);

    const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

    // Fetch seed data from backend
    useEffect(() => {
        Promise.all([
            fetch(`${API}/api/visitors`).then(r => r.json()),
            fetch(`${API}/api/visitors/stats`).then(r => r.json()),
        ]).then(([vData, sData]) => {
            setVisitors(vData.visitors);
            setStats(sData);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    // Trickle in live visitors every 8-14s
    useEffect(() => {
        if (loading) return;
        const interval = setInterval(() => {
            const v = generateLiveVisitor();
            setVisitors(prev => [v, ...prev.slice(0, 24)]);
            setNewIds(prev => new Set([v.visitor_id, ...prev]));
            setTimeout(() => setNewIds(prev => { const n = new Set(prev); n.delete(v.visitor_id); return n; }), 3000);
        }, Math.floor(Math.random() * 6000) + 8000);
        return () => clearInterval(interval);
    }, [loading]);

    if (loading) {
        return (
            <div style={{ padding: 60, textAlign: "center", color: "var(--text3)" }}>
                <div style={{ fontSize: 13 }}>Loading visitor data…</div>
            </div>
        );
    }

    // Derive live stats from current visitors array
    const totalVisitors = visitors.length;
    const avgScore = visitors.length ? Math.round((visitors.reduce((a, v) => a + v.intent_score, 0) / visitors.length) * 10) / 10 : 0;
    const highIntent = visitors.filter(v => v.intent_score >= 8).length;
    const stageCounts: Record<string, number> = {};
    visitors.forEach(v => { stageCounts[v.intent_stage] = (stageCounts[v.intent_stage] || 0) + 1; });
    const pageCounts: Record<string, number> = {};
    visitors.forEach(v => v.pages_visited.forEach(p => { pageCounts[p] = (pageCounts[p] || 0) + 1; }));
    const topPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxPage = topPages[0]?.[1] || 1;

    const companyCounts: Record<string, { count: number; score: number; industry: string }> = {};
    visitors.forEach(v => {
        if (!companyCounts[v.company]) companyCounts[v.company] = { count: 0, score: 0, industry: v.industry };
        companyCounts[v.company].count++;
        companyCounts[v.company].score = Math.max(companyCounts[v.company].score, v.intent_score);
    });
    const topCompanies = Object.entries(companyCounts).sort((a, b) => b[1].score - a[1].score).slice(0, 6);

    return (
        <div style={{ padding: "28px", maxWidth: 1400, margin: "0 auto" }}>

            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
                {[
                    { label: "Total visitors", value: totalVisitors, sub: "tracked sessions" },
                    { label: "High intent", value: highIntent, sub: "score ≥ 8.0", accent: "#00C48C" },
                    { label: "Avg intent score", value: `${avgScore} / 10`, sub: "across all visitors" },
                    { label: "Decision stage", value: stageCounts["Decision"] || 0, sub: "ready to buy", accent: "#00C48C" },
                ].map((k, i) => (
                    <div key={i} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 16, padding: "18px 20px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text3)", marginBottom: 8 }}>{k.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", color: k.accent || "var(--text)", lineHeight: 1 }}>{k.value}</div>
                        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 5 }}>{k.sub}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

                {/* Stage funnel */}
                <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text3)", marginBottom: 16 }}>Intent stage breakdown</div>
                    {(["Decision", "Evaluation", "Research", "Awareness"] as const).map(stage => {
                        const count = stageCounts[stage] || 0;
                        const pct = totalVisitors ? Math.round((count / totalVisitors) * 100) : 0;
                        const { color } = stagePill(stage);
                        return (
                            <div key={stage} style={{ marginBottom: 14 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color }}>{stage}</span>
                                    <span style={{ fontSize: 12, color: "var(--text3)", fontFamily: "var(--mono)" }}>{count} · {pct}%</span>
                                </div>
                                <div style={{ height: 8, background: "var(--bg4)", borderRadius: 4, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Top pages */}
                <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text3)", marginBottom: 16 }}>Top pages by visits</div>
                    {topPages.map(([page, count]) => (
                        <div key={page} style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--text)" }}>{page}</span>
                                <span style={{ fontSize: 12, color: "var(--text3)" }}>{count}</span>
                            </div>
                            <div style={{ height: 6, background: "var(--bg4)", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.round((count / maxPage) * 100)}%`, background: "#00C48C", borderRadius: 3, transition: "width 0.6s ease" }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>

                {/* Live visitor table */}
                <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text3)" }}>
                            Live visitor feed
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#00C48C", background: "rgba(0,196,140,0.1)", padding: "3px 10px", borderRadius: 100 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00C48C", animation: "pulse-dot 1.2s ease-in-out infinite" }} />
                            Live · {totalVisitors} sessions
                        </div>
                    </div>
                    <div style={{ overflowY: "auto", maxHeight: 520 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                    {["ID", "Company", "Pages", "Device", "Score", "Stage", "Time"].map(h => (
                                        <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", whiteSpace: "nowrap" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {visitors.map(v => {
                                    const { bg, color } = stagePill(v.intent_stage);
                                    const isNew = newIds.has(v.visitor_id);
                                    const isSelected = selected?.visitor_id === v.visitor_id;
                                    return (
                                        <tr
                                            key={v.visitor_id}
                                            onClick={() => setSelected(isSelected ? null : v)}
                                            style={{
                                                borderBottom: "1px solid var(--border)",
                                                cursor: "pointer",
                                                background: isSelected ? "var(--log-bg)" : isNew ? "rgba(0,196,140,0.05)" : "transparent",
                                                transition: "background 0.3s",
                                            }}
                                        >
                                            <td style={{ padding: "10px 14px", fontFamily: "var(--mono)", color: "var(--text3)", fontSize: 11 }}>{v.visitor_id}</td>
                                            <td style={{ padding: "10px 14px" }}>
                                                <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 12 }}>{v.company}</div>
                                                <div style={{ fontSize: 11, color: "var(--text3)" }}>{v.industry}</div>
                                            </td>
                                            <td style={{ padding: "10px 14px" }}>
                                                {v.pages_visited.map((p, i) => (
                                                    <div key={i} style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)" }}>{p}</div>
                                                ))}
                                            </td>
                                            <td style={{ padding: "10px 14px", color: "var(--text3)", fontSize: 11 }}>{v.device}</td>
                                            <td style={{ padding: "10px 14px" }}>
                                                <span style={{ fontWeight: 700, color: scoreColor(v.intent_score), fontFamily: "var(--mono)" }}>{v.intent_score.toFixed(1)}</span>
                                            </td>
                                            <td style={{ padding: "10px 14px" }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: bg, color, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{v.intent_stage}</span>
                                            </td>
                                            <td style={{ padding: "10px 14px", color: "var(--text3)", whiteSpace: "nowrap", fontSize: 11 }}>{timeAgo(v.timestamp)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right sidebar */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                    {/* Top accounts */}
                    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text3)", marginBottom: 14 }}>Top accounts this week</div>
                        {topCompanies.map(([name, data]) => (
                            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#00C48C", flexShrink: 0 }}>
                                    {name[0]}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{data.count} visit{data.count !== 1 ? "s" : ""}</div>
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(data.score), fontFamily: "var(--mono)", flexShrink: 0 }}>{data.score.toFixed(1)}</span>
                            </div>
                        ))}
                    </div>

                    {/* Selected visitor detail */}
                    {selected ? (
                        <div style={{ background: "var(--bg2)", borderLeft: "3px solid #00C48C", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 18px" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#00C48C", marginBottom: 12 }}>Visitor detail</div>
                            {[
                                { k: "ID", v: selected.visitor_id },
                                { k: "IP", v: selected.ip },
                                { k: "Company", v: selected.company },
                                { k: "Persona", v: selected.persona },
                                { k: "Device", v: selected.device },
                                { k: "Location", v: selected.location },
                                { k: "Referral", v: selected.referral_source },
                                { k: "Pages", v: selected.pages_visited.join(", ") },
                                { k: "Dwell", v: `${selected.time_on_site_seconds}s` },
                                { k: "Visits/wk", v: String(selected.visits_this_week) },
                                { k: "Intent", v: `${selected.intent_score.toFixed(1)} / 10` },
                                { k: "Stage", v: selected.intent_stage },
                            ].map(({ k, v }) => (
                                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 7, fontSize: 12 }}>
                                    <span style={{ color: "var(--text3)", flexShrink: 0 }}>{k}</span>
                                    <span style={{ color: "var(--text)", fontFamily: "var(--mono)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>{v}</span>
                                </div>
                            ))}
                            {onRunPipeline && (
                                <button
                                    onClick={() => { onRunPipeline(selected); setSelected(null); }}
                                    style={{ width: "100%", marginTop: 10, padding: "9px", background: "#00C48C", border: "none", borderRadius: 8, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--sans)" }}
                                >
                                    ▶ Run intelligence pipeline →
                                </button>
                            )}
                        </div>
                    ) : (
                        <div style={{ background: "var(--bg3)", border: "1px dashed var(--border)", borderRadius: 16, padding: 20, textAlign: "center", color: "var(--text3)", fontSize: 12 }}>
                            Click any visitor to see full detail and run the intelligence pipeline
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
import { useState, useRef, useEffect } from "react";
import "./App.css";
import AnalyticsPage from "./AnalyticsPage";
import AskAgent from "./AskAgent";

// ── Types ────────────────────────────────────────────
type AgentStatus = "idle" | "running" | "done" | "error";
interface LogEntry {
  id: string;
  agent: string;
  label: string;
  icon: string;
  status: AgentStatus;
  data: Record<string, unknown> | null;
  error?: string;
  ts: number;
}

const AGENT_META: Record<string, { label: string; icon: string; desc: string }> = {
  batch: { label: "Processing account list", icon: "⟳", desc: "Running pipeline for each company" },
  identifier: { label: "Identifying the company...", icon: "◎", desc: "Resolving company from IP or name" },
  enricher: { label: "Gathering company data...", icon: "◈", desc: "Fetching firmographics, tech stack & signals" },
  intent: { label: "Analyzing buying intent...", icon: "◆", desc: "Scoring purchase likelihood from behavior" },
  persona: { label: "Inferring visitor persona...", icon: "◉", desc: "Determining likely role from page behavior" },
  synthesis: { label: "Generating intelligence report...", icon: "✦", desc: "Building AI summary & sales recommendations" },
};

// ── Log entry component ──────────────────────────────
function LogEntryRow({ entry, isLast }: { entry: LogEntry; isLast: boolean }) {
  const { agent, label, icon, status, data, error } = entry;

  const renderData = () => {
    if (!data) return null;

    if (agent === "identifier") {
      return (
        <div className="log-data">
          {data.name && <div className="log-kv"><div className="log-k">Company</div><div className="log-v">{data.name as string}</div></div>}
          {data.domain && <div className="log-kv"><div className="log-k">Domain</div><div className="log-v">{data.domain as string}</div></div>}
          {data.industry && <div className="log-kv"><div className="log-k">Industry</div><div className="log-v">{data.industry as string}</div></div>}
          {data.headquarters && <div className="log-kv"><div className="log-k">HQ</div><div className="log-v">{data.headquarters as string}</div></div>}
          {data.confidence !== undefined && <div className="log-kv"><div className="log-k">Confidence</div><div className="log-v">{Math.round((data.confidence as number) * 100)}%</div></div>}
        </div>
      );
    }
    if (agent === "enricher") {
      const p = data.profile as Record<string, unknown> | undefined;
      const t = data.tech_stack as Record<string, unknown> | undefined;
      const techs = [t?.crm, t?.marketing, t?.analytics, t?.platform, ...(t?.other as string[] || [])].filter(Boolean);
      return (
        <>
          <div className="log-data">
            {p?.size && <div className="log-kv"><div className="log-k">Size</div><div className="log-v">{p.size as string}</div></div>}
            {p?.founded_year && <div className="log-kv"><div className="log-k">Founded</div><div className="log-v">{p.founded_year as string}</div></div>}
            {p?.description && <div className="log-kv" style={{ gridColumn: '1/-1' }}><div className="log-k">About</div><div className="log-v" style={{ whiteSpace: 'normal' }}>{(p.description as string).slice(0, 120)}…</div></div>}
          </div>
          {techs.length > 0 && (
            <div className="log-tags" style={{ marginTop: 8 }}>
              {techs.map((t, i) => <span key={i} className="log-tag">{t as string}</span>)}
            </div>
          )}
        </>
      );
    }
    if (agent === "intent") {
      return (
        <>
          <div className="log-data">
            <div className="log-kv"><div className="log-k">Score</div><div className="log-v" style={{ color: 'var(--accent)', fontWeight: 700 }}>{(data.score as number)?.toFixed(1)} / 10</div></div>
            <div className="log-kv"><div className="log-k">Stage</div><div className="log-v">{data.stage as string}</div></div>
          </div>
          {Array.isArray(data.signals) && (data.signals as string[]).length > 0 && (
            <div className="log-tags">
              {(data.signals as string[]).map((s, i) => <span key={i} className="log-tag">{s}</span>)}
            </div>
          )}
        </>
      );
    }
    if (agent === "persona") {
      return (
        <div className="log-data">
          <div className="log-kv"><div className="log-k">Role</div><div className="log-v">{data.likely_role as string}</div></div>
          <div className="log-kv"><div className="log-k">Dept</div><div className="log-v">{data.department as string}</div></div>
          <div className="log-kv"><div className="log-k">Seniority</div><div className="log-v">{data.seniority as string}</div></div>
          <div className="log-kv"><div className="log-k">Confidence</div><div className="log-v">{Math.round((data.confidence as number) * 100)}%</div></div>
        </div>
      );
    }
    if (agent === "synthesis") {
      return <div className="log-summary">{data.ai_summary as string}</div>;
    }
    if (agent === "batch") {
      return (
        <div className="log-data">
          <div className="log-kv"><div className="log-k">Processing</div><div className="log-v">{data.company as string}</div></div>
          <div className="log-kv"><div className="log-k">Progress</div><div className="log-v">{data.current as number} of {data.total as number}</div></div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="log-entry">
      <div className="log-timeline">
        <div className={`log-dot ${status}`} />
        {!isLast && <div className="log-line-vert" />}
      </div>
      <div className="log-content">
        <div className="log-content-header">
          <div className="log-agent-name">
            <span className="log-agent-icon">{icon}</span>
            {label}
          </div>
          <span className={`log-status-pill pill-${status}`}>
            {status === "running" ? "processing" : status}
          </span>
        </div>

        {status === "running" && (
          <div className="log-thinking">
            <span style={{ fontSize: 11 }}>Working</span>
            <span className="thinking-dots">
              <span /><span /><span />
            </span>
          </div>
        )}

        {status === "done" && renderData()}
        {status === "error" && <div className="log-error">{error}</div>}
      </div>
    </div>
  );
}

// ── Intel Report ─────────────────────────────────────
function IntelReport({ intel }: { intel: Record<string, unknown> | null }) {
  if (!intel) return null;

  const company = intel.company as Record<string, unknown> | undefined;
  const tech = intel.tech_stack as Record<string, unknown> | undefined;
  const persona = intel.persona as Record<string, unknown> | undefined;
  const intent = intel.intent as Record<string, unknown> | undefined;
  const leadership = intel.leadership as Record<string, unknown>[] | undefined;
  const signals = intel.business_signals as Record<string, unknown>[] | undefined;
  const actions = intel.recommended_actions as Record<string, unknown>[] | undefined;

  const score = intent?.score as number | undefined;
  const scoreColor = !score ? "#888" : score >= 8 ? "#00C48C" : score >= 5 ? "#ff9800" : "#f44336";

  const techs: { cat: string; val: string }[] = [];
  if (tech?.crm) techs.push({ cat: "CRM", val: tech.crm as string });
  if (tech?.marketing) techs.push({ cat: "Mktg", val: tech.marketing as string });
  if (tech?.analytics) techs.push({ cat: "Analytics", val: tech.analytics as string });
  if (tech?.platform) techs.push({ cat: "Platform", val: tech.platform as string });
  (tech?.other as string[] || []).forEach(t => techs.push({ cat: "Other", val: t }));

  return (
    <div className="report-panel">
      {/* Header */}
      <div className="report-header">
        <div className="report-company-avatar" style={{ overflow: 'hidden', position: 'relative' }}>
          {intel.logo_url
            ? <>
              <img
                src={intel.logo_url as string}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }}
                onError={e => {
                  const img = e.target as HTMLImageElement;
                  img.style.display = 'none';
                  const fallback = img.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <span style={{ display: 'none', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: 'white', position: 'absolute', top: 0, left: 0 }}>
                {String(company?.name || "?")[0].toUpperCase()}
              </span>
            </>
            : String(company?.name || "?")[0].toUpperCase()
          }
        </div>
        <div>
          <div className="report-company-name">{company?.name as string}</div>
          <div className="report-company-meta">
            {[company?.domain, company?.industry, company?.headquarters].filter(Boolean).join(" · ")}
          </div>
        </div>
        {company?.confidence !== undefined && (
          <div className="report-confidence">
            {Math.round((company.confidence as number) * 100)}% confidence
          </div>
        )}
      </div>

      <div className="report-body">
        <div className="report-grid">
          {/* Company profile */}
          <div className="report-card">
            <div className="rc-title"><span className="rc-icon">🏢</span> Company profile</div>
            {company?.description && (
              <p style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6, marginBottom: 10 }}>
                {company.description as string}
              </p>
            )}
            <div className="kv-grid">
              {company?.size && <div className="kv-row"><span className="kv-k">Employees</span><span className="kv-v">{company.size as string}</span></div>}
              {company?.founded_year && <div className="kv-row"><span className="kv-k">Founded</span><span className="kv-v">{company.founded_year as string}</span></div>}
              {company?.headquarters && <div className="kv-row"><span className="kv-k">HQ</span><span className="kv-v">{company.headquarters as string}</span></div>}
            </div>
          </div>

          {/* Buying intent */}
          {intent && (
            <div className="report-card">
              <div className="rc-title"><span className="rc-icon">🎯</span> Buying intent</div>
              <div className="score-row">
                <span className="score-num" style={{ color: scoreColor }}>{(intent.score as number)?.toFixed(1)}</span>
                <span className="score-denom">/10</span>
                <div className="score-bar-wrap">
                  <div className="score-bar-fill" style={{ width: `${((intent.score as number) / 10) * 100}%`, background: scoreColor }} />
                </div>
              </div>
              <div className="intent-stage-badge">{intent.stage as string}</div>
              <div className="signals-list">
                {(intent.signals as string[] || []).map((s, i) => (
                  <div key={i} className="signal-item"><span className="signal-arrow">→</span>{s}</div>
                ))}
              </div>
            </div>
          )}

          {/* Persona */}
          {persona && (
            <div className="report-card">
              <div className="rc-title"><span className="rc-icon">👤</span> Likely persona</div>
              <div className="persona-role">{persona.likely_role as string}</div>
              <div className="persona-sub">{persona.department as string} · {persona.seniority as string}</div>
              <div className="confidence-bar-wrap">
                <div className="confidence-bar-track">
                  <div className="confidence-bar-fill" style={{ width: `${(persona.confidence as number) * 100}%` }} />
                </div>
                <span className="confidence-pct">{Math.round((persona.confidence as number) * 100)}%</span>
              </div>
              {persona.reasoning && (
                <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 8, lineHeight: 1.5 }}>{persona.reasoning as string}</p>
              )}
            </div>
          )}

          {/* Tech stack */}
          {techs.length > 0 && (
            <div className="report-card">
              <div className="rc-title"><span className="rc-icon">⚙️</span> Technology stack</div>
              <div className="tech-chips">
                {techs.map((t, i) => (
                  <div key={i} className="tech-chip">
                    <span className="tech-cat-label">{t.cat}</span>
                    {t.val}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leadership */}
          {(() => {
            const filtered = (leadership || []).filter(l => l.name || l.title);
            return filtered.length > 0 ? (
              <div className="report-card">
                <div className="rc-title"><span className="rc-icon">🤝</span> Key contacts</div>
                <div className="leader-list">
                  {filtered.map((l, i) => (
                    <div key={i} className="leader-row">
                      <div className="leader-av">{String(l.title || "?")[0]}</div>
                      <div>
                        {l.name && <div className="leader-name-text">{l.name as string}</div>}
                        {l.title && <div className={`leader-title-text ${!l.name ? "leader-title-only" : ""}`}>{l.title as string}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {/* Business signals */}
          {signals && signals.length > 0 && (
            <div className="report-card">
              <div className="rc-title"><span className="rc-icon">📈</span> Business signals</div>
              <div className="biz-signal-list">
                {signals.map((s, i) => (
                  <div key={i} className="biz-signal-item">
                    <div className="biz-signal-type">{(s.signal_type as string).replace(/_/g, " ")}</div>
                    <div className="biz-signal-desc">{s.description as string}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* AI Summary */}
        {intel.ai_summary && (
          <div className="report-summary">
            <div className="summary-label">AI intelligence summary</div>
            <div className="summary-text">{intel.ai_summary as string}</div>
          </div>
        )}

        {/* Actions */}
        {actions && actions.length > 0 && (
          <div>
            <div className="rc-title" style={{ marginBottom: 10 }}><span className="rc-icon">⚡</span> Recommended actions</div>
            <div className="actions-list">
              {actions.map((a, i) => (
                <div key={i} className="action-row">
                  <span className={`priority-pill p-${(a.priority as string).toLowerCase()}`}>{a.priority as string}</span>
                  <div>
                    <div className="action-text">{a.action as string}</div>
                    <div className="action-rationale">{a.rationale as string}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Input Panel ──────────────────────────────────────
function InputPanel({ onSubmit, isRunning, onStop }: {
  onSubmit: (p: Record<string, unknown>) => void;
  isRunning: boolean;
  onStop: () => void;
}) {
  const [visitorId, setVisitorId] = useState("V001");
  const [ip, setIp] = useState("34.201.100.50");
  const [companyHint, setCompanyHint] = useState("");
  const [pages, setPages] = useState("/pricing\n/ai-sales-agent\n/case-studies");
  const [dwell, setDwell] = useState("222");
  const [visits, setVisits] = useState("3");
  const [referral, setReferral] = useState("linkedin");
  const [device, setDevice] = useState("Desktop");
  const [location, setLocation] = useState("");

  const loadDemo = () => {
    setVisitorId("V001");
    setIp("34.201.100.50");
    setCompanyHint("");
    setPages("/pricing\n/ai-sales-agent\n/case-studies");
    setDwell("222"); setVisits("3"); setReferral("linkedin");
    setDevice("Desktop"); setLocation("Texas, USA");
  };

  const submit = () => {
    onSubmit({
      mode: "visitor",
      visitor: {
        visitor_id: visitorId || null,
        ip: ip || null,
        company_name_hint: companyHint || null,
        pages_visited: pages.split("\n").map(p => p.trim()).filter(Boolean),
        time_on_site_seconds: parseInt(dwell) || 0,
        visits_this_week: parseInt(visits) || 1,
        referral_source: referral || null,
        device: device || null,
        location: location || null,
        timestamp: new Date().toISOString(),
      },
    });
  };

  return (
    <div className="input-panel">
      <div className="input-panel-top">
        <div className="panel-title">Analyze account</div>

      </div>

      <div className="field-row" style={{ marginBottom: 14 }}>
        <div className="field">
          <label className="field-label">Visitor ID</label>
          <input className="field-input" value={visitorId} onChange={e => setVisitorId(e.target.value)} placeholder="V001" />
        </div>
        <div className="field">
          <label className="field-label">Device</label>
          <select className="field-input" value={device} onChange={e => setDevice(e.target.value)} style={{ cursor: "pointer" }}>
            <option>Desktop</option>
            <option>Mobile</option>
            <option>Tablet</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label className="field-label">IP address</label>
        <input className="field-input" value={ip} onChange={e => setIp(e.target.value)} placeholder="34.201.100.50" />
      </div>
      <div className="field">
        <label className="field-label">Company hint <span className="field-hint">(optional)</span></label>
        <input className="field-input" value={companyHint} onChange={e => setCompanyHint(e.target.value)} placeholder="e.g. Acme Corp" />
      </div>
      <div className="field">
        <label className="field-label">Pages visited <span className="field-hint">(one per line)</span></label>
        <textarea className="field-textarea" rows={3} value={pages} onChange={e => setPages(e.target.value)} />
      </div>
      <div className="field-row" style={{ marginBottom: 14 }}>
        <div className="field">
          <label className="field-label">Dwell (sec)</label>
          <input className="field-input" value={dwell} onChange={e => setDwell(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Visits/week</label>
          <input className="field-input" value={visits} onChange={e => setVisits(e.target.value)} />
        </div>
      </div>
      <div className="field-row" style={{ marginBottom: 14 }}>
        <div className="field">
          <label className="field-label">Referral source</label>
          <input className="field-input" value={referral} onChange={e => setReferral(e.target.value)} placeholder="linkedin" />
        </div>
        <div className="field">
          <label className="field-label">Location</label>
          <input className="field-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Texas, USA" />
        </div>
      </div>

      {isRunning ? (
        <button className="run-btn stop" onClick={onStop}>◼ Stop pipeline</button>
      ) : (
        <button className="run-btn" onClick={submit}>▶ Run intelligence pipeline</button>
      )}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activePage, setActivePage] = useState<"analyze" | "analytics">("analyze");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [finalIntel, setFinalIntel] = useState<Record<string, unknown> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const upsertLog = (agent: string, patch: Partial<LogEntry>) => {
    const meta = AGENT_META[agent] || { label: agent, icon: "·", desc: "" };
    setLog(prev => {
      const idx = prev.findLastIndex(e => e.agent === agent && e.status === "running");
      if (patch.status === "running" && idx === -1) {
        return [...prev, { id: `${agent}-${Date.now()}`, agent, label: meta.label, icon: meta.icon, status: "running", data: null, ts: Date.now(), ...patch }];
      }
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...patch };
        return updated;
      }
      return [...prev, { id: `${agent}-${Date.now()}`, agent, label: meta.label, icon: meta.icon, status: "idle", data: null, ts: Date.now(), ...patch }];
    });
  };

  const runPipeline = async (payload: Record<string, unknown>) => {
    setLog([]);
    setFinalIntel(null);
    setIsRunning(true);
    abortRef.current = new AbortController();

    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

    try {
      const resp = await fetch(`${API_URL}/api/enrich/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      });

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            const { agent, status, data, error } = event;
            if (agent === "complete") {
              setFinalIntel(data);
            } else if (agent !== "batch") {
              upsertLog(agent, { status, data: data || null, error });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") console.error(err);
    } finally {
      setIsRunning(false);
    }
  };

  const anyRunning = log.some(e => e.status === "running");

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-hex">N</div>
            <span className="logo-name">NEXUS</span>
            <span className="logo-tag">Account Intelligence</span>
          </div>
          <div className="header-center">
            <div className="nav-tabs">
              <button
                className={`nav-tab ${activePage === "analyze" ? "active" : ""}`}
                onClick={() => setActivePage("analyze")}
              >
                Analyze account
              </button>
              <button
                className={`nav-tab ${activePage === "analytics" ? "active" : ""}`}
                onClick={() => setActivePage("analytics")}
              >
                Visitor analytics
              </button>
            </div>
          </div>
          <div className="header-right">
            <span className="powered-by">Created by <span>Surendra</span></span>
            <button className="theme-toggle" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} title="Toggle theme">
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </div>
      </header>

      {activePage === "analytics" ? (
        <AnalyticsPage theme={theme} onRunPipeline={(visitor) => {
          // Pre-fill pipeline with this visitor's data and switch to analyze tab
          setActivePage("analyze");
          setTimeout(() => {
            runPipeline({
              mode: "visitor",
              visitor: {
                visitor_id: visitor.visitor_id,
                ip: visitor.ip,
                pages_visited: visitor.pages_visited,
                time_on_site_seconds: visitor.time_on_site_seconds,
                visits_this_week: visitor.visits_this_week,
                referral_source: visitor.referral_source,
                device: visitor.device,
                location: visitor.location,
                timestamp: visitor.timestamp,
              }
            });
          }, 100);
        }} />
      ) : (
        <main className="main">
          {/* Left — input */}
          <InputPanel onSubmit={runPipeline} isRunning={isRunning} onStop={() => abortRef.current?.abort()} />

          {/* Right — log + report */}
          <div className="right-panel">
            {/* Agent log */}
            <div className="agent-log-panel">
              <div className="log-header">
                <div className="log-header-left">
                  <div>
                    <div className="log-title">Intelligence pipeline</div>
                    <div className="log-subtitle">Agent execution log</div>
                  </div>
                </div>
                {anyRunning && (
                  <div className="live-badge">
                    <div className="live-dot" />
                    Live
                  </div>
                )}
              </div>

              <div className="log-body">
                {log.length === 0 ? (
                  <div className="log-empty">
                    <div className="log-empty-icon">⬡</div>
                    Enter an IP address or company name and run the pipeline to see agents working in real time.
                  </div>
                ) : (
                  <>
                    {log.map((entry, i) => (
                      <LogEntryRow key={entry.id} entry={entry} isLast={i === log.length - 1} />
                    ))}
                    <div ref={logEndRef} />
                  </>
                )}
              </div>
            </div>

            {/* Final report */}
            {finalIntel ? (
              <IntelReport intel={finalIntel} />
            ) : !isRunning && log.length === 0 ? (
              <div className="report-panel">
                <div className="report-empty">
                  <div className="empty-hex">⬡</div>
                  <div className="empty-title">No report yet</div>
                  <div className="empty-sub">Run the pipeline to generate a full account intelligence report.</div>
                </div>
              </div>
            ) : null}
          </div>
        </main>
      )}
      <AskAgent intel={finalIntel} />
    </div>
  );
}
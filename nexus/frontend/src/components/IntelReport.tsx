interface Props {
  intel: Record<string, unknown> | null;
  isRunning: boolean;
}

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`priority-badge priority-${priority.toLowerCase()}`}>{priority}</span>;
}

function ScoreBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score >= 8 ? "#22c55e" : score >= 5 ? "#f59e0b" : "#ef4444";
  return (
    <div className="score-bar-wrap">
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="score-val">{score.toFixed(1)}</span>
    </div>
  );
}

export default function IntelReport({ intel, isRunning }: Props) {
  if (!intel && !isRunning) {
    return (
      <div className="report-empty">
        <div className="empty-icon">⬡</div>
        <p>Run the intelligence pipeline to generate a full account report.</p>
      </div>
    );
  }

  if (isRunning && !intel) {
    return (
      <div className="report-empty">
        <div className="pulse-ring" />
        <p>Pipeline running — results will appear here when complete.</p>
      </div>
    );
  }

  if (!intel) return null;

  const company = intel.company as Record<string, unknown> | undefined;
  const tech = intel.tech_stack as Record<string, unknown> | undefined;
  const persona = intel.persona as Record<string, unknown> | undefined;
  const intent = intel.intent as Record<string, unknown> | undefined;
  const leadership = intel.leadership as Record<string, unknown>[] | undefined;
  const signals = intel.business_signals as Record<string, unknown>[] | undefined;
  const actions = intel.recommended_actions as Record<string, unknown>[] | undefined;

  return (
    <div className="intel-report">
      {/* Company header */}
      <div className="report-company-header">
        <div className="company-logo-placeholder">
          {String(company?.name || "?")[0].toUpperCase()}
        </div>
        <div>
          <h3 className="company-name">{company?.name as string}</h3>
          <span className="company-meta">
            {[company?.domain, company?.industry, company?.headquarters]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        {company?.confidence !== undefined && (
          <div className="confidence-badge">
            {Math.round((company.confidence as number) * 100)}% confidence
          </div>
        )}
      </div>

      <div className="report-grid">
        {/* Firmographics */}
        <div className="report-card">
          <h4 className="card-title">Company Profile</h4>
          {company?.description && (
            <p className="card-desc">{company.description as string}</p>
          )}
          <div className="kv-list">
            {company?.size && <><dt>Employees</dt><dd>{company.size as string}</dd></>}
            {company?.founded_year && <><dt>Founded</dt><dd>{company.founded_year as string}</dd></>}
            {company?.headquarters && <><dt>HQ</dt><dd>{company.headquarters as string}</dd></>}
          </div>
        </div>

        {/* Intent */}
        {intent && (
          <div className="report-card">
            <h4 className="card-title">Buying Intent</h4>
            <ScoreBar score={intent.score as number} />
            <div className="intent-stage">{intent.stage as string}</div>
            <div className="signal-list">
              {(intent.signals as string[] | undefined)?.map((s, i) => (
                <div key={i} className="signal-item">→ {s}</div>
              ))}
            </div>
          </div>
        )}

        {/* Persona */}
        {persona && (
          <div className="report-card">
            <h4 className="card-title">Likely Persona</h4>
            <div className="persona-role">{persona.likely_role as string}</div>
            <div className="persona-meta">
              {persona.department as string} · {persona.seniority as string}
            </div>
            <div className="persona-confidence">
              {Math.round((persona.confidence as number) * 100)}% confidence
            </div>
            {persona.reasoning && (
              <p className="persona-reasoning">{persona.reasoning as string}</p>
            )}
          </div>
        )}

        {/* Tech stack */}
        {tech && (
          <div className="report-card">
            <h4 className="card-title">Technology Stack</h4>
            <div className="tech-grid">
              {tech.crm && <div className="tech-item"><span className="tech-cat">CRM</span><span className="tech-val">{tech.crm as string}</span></div>}
              {tech.marketing && <div className="tech-item"><span className="tech-cat">Marketing</span><span className="tech-val">{tech.marketing as string}</span></div>}
              {tech.analytics && <div className="tech-item"><span className="tech-cat">Analytics</span><span className="tech-val">{tech.analytics as string}</span></div>}
              {tech.platform && <div className="tech-item"><span className="tech-cat">Platform</span><span className="tech-val">{tech.platform as string}</span></div>}
              {(tech.other as string[] | undefined)?.map((t, i) => (
                <div key={i} className="tech-item"><span className="tech-cat">Other</span><span className="tech-val">{t}</span></div>
              ))}
            </div>
          </div>
        )}

        {/* Leadership */}
        {leadership && leadership.length > 0 && (
          <div className="report-card">
            <h4 className="card-title">Key Contacts</h4>
            <div className="leadership-list">
              {leadership.map((l, i) => (
                <div key={i} className="leadership-item">
                  <div className="leader-avatar">{l.title ? String(l.title)[0] : "?"}</div>
                  <div>
                    <div className="leader-name">{l.name as string || "—"}</div>
                    <div className="leader-title">{l.title as string}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Business signals */}
        {signals && signals.length > 0 && (
          <div className="report-card">
            <h4 className="card-title">Business Signals</h4>
            {signals.map((s, i) => (
              <div key={i} className="biz-signal">
                <span className="signal-type">{(s.signal_type as string).replace(/_/g, " ")}</span>
                <span className="signal-desc">{s.description as string}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Summary */}
      {intel.ai_summary && (
        <div className="report-summary">
          <h4 className="card-title">AI Intelligence Summary</h4>
          <p className="summary-text">{intel.ai_summary as string}</p>
        </div>
      )}

      {/* Recommended actions */}
      {actions && actions.length > 0 && (
        <div className="report-actions">
          <h4 className="card-title">Recommended Sales Actions</h4>
          <div className="actions-list">
            {actions.map((a, i) => (
              <div key={i} className="action-item">
                <PriorityBadge priority={a.priority as string} />
                <div className="action-body">
                  <div className="action-text">{a.action as string}</div>
                  <div className="action-rationale">{a.rationale as string}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";

interface Props {
  onSubmit: (payload: Record<string, unknown>) => void;
  isRunning: boolean;
  onStop: () => void;
}

const DEMO_VISITOR = {
  visitor_id: "001",
  ip: "34.201.100.50",
  pages_visited: ["/pricing", "/ai-sales-agent", "/case-studies"],
  time_on_site_seconds: 222,
  visits_this_week: 3,
  referral_source: "linkedin",
};

const DEMO_COMPANIES = ["BrightPath Lending", "Rocket Mortgage", "Redfin"];

export default function InputPanel({ onSubmit, isRunning, onStop }: Props) {
  const [mode, setMode] = useState<"visitor" | "company">("visitor");

  // Visitor mode state
  const [ip, setIp] = useState("34.201.100.50");
  const [pages, setPages] = useState("/pricing\n/ai-sales-agent\n/case-studies");
  const [dwell, setDwell] = useState("222");
  const [visits, setVisits] = useState("3");
  const [referral, setReferral] = useState("linkedin");

  // Company mode state
  const [companyInput, setCompanyInput] = useState("BrightPath Lending");

  const handleSubmit = () => {
    if (mode === "visitor") {
      onSubmit({
        mode: "visitor",
        visitor: {
          ip,
          pages_visited: pages.split("\n").map((p) => p.trim()).filter(Boolean),
          time_on_site_seconds: parseInt(dwell) || 0,
          visits_this_week: parseInt(visits) || 1,
          referral_source: referral || null,
        },
      });
    } else {
      onSubmit({
        mode: "company",
        company_names: [companyInput.trim()],
      });
    }
  };

  const loadDemo = () => {
    if (mode === "visitor") {
      setIp(DEMO_VISITOR.ip);
      setPages(DEMO_VISITOR.pages_visited.join("\n"));
      setDwell(String(DEMO_VISITOR.time_on_site_seconds));
      setVisits(String(DEMO_VISITOR.visits_this_week));
      setReferral(DEMO_VISITOR.referral_source);
    } else {
      setCompanyInput(DEMO_COMPANIES[Math.floor(Math.random() * DEMO_COMPANIES.length)]);
    }
  };

  return (
    <div className="input-panel">
      <div className="input-panel-header">
        <h2 className="section-title">Analyze Account</h2>
        <button className="demo-btn" onClick={loadDemo} disabled={isRunning}>
          Load demo
        </button>
      </div>

      {/* Mode toggle */}
      <div className="mode-toggle">
        <button
          className={`mode-btn ${mode === "visitor" ? "active" : ""}`}
          onClick={() => setMode("visitor")}
        >
          Visitor Signal
        </button>
        <button
          className={`mode-btn ${mode === "company" ? "active" : ""}`}
          onClick={() => setMode("company")}
        >
          Company Name
        </button>
      </div>

      <div className="input-fields">
        {mode === "visitor" ? (
          <>
            <label className="field-label">IP Address</label>
            <input className="field-input" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="e.g. 34.201.100.50" />

            <label className="field-label">Pages Visited <span className="field-hint">(one per line)</span></label>
            <textarea className="field-textarea" value={pages} onChange={(e) => setPages(e.target.value)} rows={4} placeholder="/pricing&#10;/case-studies" />

            <div className="field-row">
              <div className="field-group">
                <label className="field-label">Dwell (seconds)</label>
                <input className="field-input" value={dwell} onChange={(e) => setDwell(e.target.value)} placeholder="222" />
              </div>
              <div className="field-group">
                <label className="field-label">Visits/week</label>
                <input className="field-input" value={visits} onChange={(e) => setVisits(e.target.value)} placeholder="3" />
              </div>
            </div>

            <label className="field-label">Referral source</label>
            <input className="field-input" value={referral} onChange={(e) => setReferral(e.target.value)} placeholder="linkedin" />
          </>
        ) : (
          <>
            <label className="field-label">Company Name</label>
            <input
              className="field-input"
              value={companyInput}
              onChange={(e) => setCompanyInput(e.target.value)}
              placeholder="e.g. BrightPath Lending"
            />
            <p className="field-hint-block">Enter any company name — NEXUS will discover the domain, enrich firmographics, and generate a sales intelligence report.</p>
          </>
        )}
      </div>

      <div className="input-actions">
        {isRunning ? (
          <button className="run-btn stop" onClick={onStop}>
            ◼ Stop Pipeline
          </button>
        ) : (
          <button className="run-btn" onClick={handleSubmit}>
            ▶ Run Intelligence Pipeline
          </button>
        )}
      </div>
    </div>
  );
}

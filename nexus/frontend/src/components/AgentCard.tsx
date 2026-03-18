import type { AgentState } from "../App";

interface Props {
  name: string;
  label: string;
  icon: string;
  state: AgentState;
}

function StatusDot({ status }: { status: string }) {
  return <span className={`status-dot status-${status}`} />;
}

function DataRow({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  const display =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (display === "[]" || display === "{}") return null;
  return (
    <div className="data-row">
      <span className="data-label">{label}</span>
      <span className="data-value">{display}</span>
    </div>
  );
}

function renderAgentData(name: string, data: Record<string, unknown> | null) {
  if (!data) return null;

  if (name === "identifier") {
    return (
      <>
        <DataRow label="Company" value={data.name as string} />
        <DataRow label="Domain" value={data.domain as string} />
        <DataRow label="Industry" value={data.industry as string} />
        <DataRow label="HQ" value={data.headquarters as string} />
        <DataRow label="Confidence" value={data.confidence ? `${Math.round((data.confidence as number) * 100)}%` : null} />
      </>
    );
  }

  if (name === "enricher") {
    const profile = data.profile as Record<string, unknown> | undefined;
    const tech = data.tech_stack as Record<string, unknown> | undefined;
    return (
      <>
        <DataRow label="Size" value={profile?.size as string} />
        <DataRow label="Founded" value={profile?.founded_year as string} />
        <DataRow label="CRM" value={tech?.crm as string} />
        <DataRow label="Marketing" value={tech?.marketing as string} />
        <DataRow label="Analytics" value={tech?.analytics as string} />
        <DataRow label="Platform" value={tech?.platform as string} />
        {Array.isArray(tech?.other) && tech.other.length > 0 && (
          <DataRow label="Other" value={(tech.other as string[]).join(", ")} />
        )}
      </>
    );
  }

  if (name === "intent") {
    return (
      <>
        <DataRow label="Score" value={`${(data.score as number)?.toFixed(1)} / 10`} />
        <DataRow label="Stage" value={data.stage as string} />
        {Array.isArray(data.signals) && (
          <div className="data-signals">
            {(data.signals as string[]).map((s, i) => (
              <span key={i} className="signal-tag">{s}</span>
            ))}
          </div>
        )}
      </>
    );
  }

  if (name === "persona") {
    return (
      <>
        <DataRow label="Role" value={data.likely_role as string} />
        <DataRow label="Dept" value={data.department as string} />
        <DataRow label="Seniority" value={data.seniority as string} />
        <DataRow label="Confidence" value={data.confidence ? `${Math.round((data.confidence as number) * 100)}%` : null} />
        <DataRow label="Reasoning" value={data.reasoning as string} />
      </>
    );
  }

  if (name === "synthesis") {
    return (
      <>
        <p className="synth-summary">{data.ai_summary as string}</p>
      </>
    );
  }

  return null;
}

export default function AgentCard({ name, label, icon, state }: Props) {
  const { status, data, error } = state;

  return (
    <div className={`agent-card agent-${status}`}>
      <div className="agent-card-header">
        <div className="agent-icon-wrap">
          <span className="agent-icon">{icon}</span>
        </div>
        <div className="agent-meta">
          <span className="agent-label">{label}</span>
          <div className="agent-status-row">
            <StatusDot status={status} />
            <span className="agent-status-text">
              {status === "idle" && "Waiting"}
              {status === "running" && "Processing…"}
              {status === "done" && "Complete"}
              {status === "error" && "Error"}
            </span>
          </div>
        </div>
      </div>

      {status === "running" && (
        <div className="agent-progress">
          <div className="progress-bar" />
        </div>
      )}

      {status === "done" && data && (
        <div className="agent-data">
          {renderAgentData(name, data)}
        </div>
      )}

      {status === "error" && error && (
        <div className="agent-error">{error}</div>
      )}
    </div>
  );
}

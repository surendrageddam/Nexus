import React, { useState, useRef, useEffect } from "react";

interface Message {
    role: "user" | "agent";
    content: string;
    loading?: boolean;
}

const SUGGESTED = [
    "Summarize this account in one paragraph",
    "Who should we reach out to first?",
    "What do the intent signals tell us?",
];

function inlineFormat(text: string): React.ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
            return <strong key={i} style={{ fontWeight: 700, color: "var(--text)" }}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("*") && part.endsWith("*"))
            return <em key={i}>{part.slice(1, -1)}</em>;
        if (part.startsWith("`") && part.endsWith("`"))
            return (
                <code key={i} style={{ fontFamily: "var(--mono)", fontSize: 11, background: "var(--bg4)", padding: "1px 5px", borderRadius: 4 }}>
                    {part.slice(1, -1)}
                </code>
            );
        return part;
    });
}

function MarkdownBlock({ text }: { text: string }) {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.match(/^[-*]\s/)) {
            const items: string[] = [];
            while (i < lines.length && lines[i].match(/^[-*]\s/)) {
                items.push(lines[i].replace(/^[-*]\s/, ""));
                i++;
            }
            elements.push(
                <ul key={"ul" + i} style={{ margin: "6px 0", paddingLeft: 16 }}>
                    {items.map((item, j) => (
                        <li key={j} style={{ marginBottom: 3 }}>{inlineFormat(item)}</li>
                    ))}
                </ul>
            );
            continue;
        }

        if (line.match(/^\d+\.\s/)) {
            const items: string[] = [];
            while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
                items.push(lines[i].replace(/^\d+\.\s/, ""));
                i++;
            }
            elements.push(
                <ol key={"ol" + i} style={{ margin: "6px 0", paddingLeft: 18 }}>
                    {items.map((item, j) => (
                        <li key={j} style={{ marginBottom: 3 }}>{inlineFormat(item)}</li>
                    ))}
                </ol>
            );
            continue;
        }

        if (line.startsWith("### ")) {
            elements.push(<div key={i} style={{ fontWeight: 700, fontSize: 13, margin: "8px 0 4px", color: "var(--text)" }}>{line.slice(4)}</div>);
        } else if (line.startsWith("## ")) {
            elements.push(<div key={i} style={{ fontWeight: 700, fontSize: 14, margin: "8px 0 4px", color: "var(--text)" }}>{line.slice(3)}</div>);
        } else if (line.trim() === "") {
            elements.push(<div key={i} style={{ height: 6 }} />);
        } else {
            elements.push(<div key={i} style={{ lineHeight: 1.6 }}>{inlineFormat(line)}</div>);
        }
        i++;
    }

    return <div style={{ fontSize: 12 }}>{elements}</div>;
}

function buildContext(intel: Record<string, unknown>): string {
    const c = intel.company as Record<string, unknown> | undefined;
    const intent = intel.intent as Record<string, unknown> | undefined;
    const persona = intel.persona as Record<string, unknown> | undefined;
    const tech = intel.tech_stack as Record<string, unknown> | undefined;
    const signals = intel.business_signals as Record<string, unknown>[] | undefined;
    const leadership = intel.leadership as Record<string, unknown>[] | undefined;
    const actions = intel.recommended_actions as Record<string, unknown>[] | undefined;
    const techList = [tech?.crm, tech?.marketing, tech?.analytics, tech?.platform, ...((tech?.other as string[]) || [])].filter(Boolean).join(", ") || "None detected";

    return [
        "ACCOUNT INTELLIGENCE CONTEXT:",
        "",
        "Company: " + c?.name + " (" + c?.domain + ")",
        "Industry: " + (c?.industry || "Unknown"),
        "Size: " + (c?.size || "Unknown"),
        "HQ: " + (c?.headquarters || "Unknown"),
        "Founded: " + (c?.founded_year || "Unknown"),
        "Description: " + (c?.description || "N/A"),
        "Data confidence: " + (c?.confidence ? Math.round((c.confidence as number) * 100) + "%" : "Unknown"),
        "",
        "Buying intent score: " + (intent?.score ?? "N/A") + " / 10",
        "Intent stage: " + (intent?.stage ?? "Unknown"),
        "Intent signals: " + ((intent?.signals as string[] || []).join(", ") || "None"),
        "Intent reasoning: " + (intent?.reasoning || "N/A"),
        "",
        "Likely visitor persona: " + (persona?.likely_role || "Unknown"),
        "Department: " + (persona?.department || "Unknown"),
        "Seniority: " + (persona?.seniority || "Unknown"),
        "Persona confidence: " + (persona?.confidence ? Math.round((persona.confidence as number) * 100) + "%" : "Unknown"),
        "Persona reasoning: " + (persona?.reasoning || "N/A"),
        "",
        "Tech stack: " + techList,
        "",
        "Business signals: " + ((signals || []).map(s => s.signal_type + ": " + s.description).join(" | ") || "None"),
        "",
        "Leadership: " + ((leadership || []).map(l => l.title + (l.name ? " (" + l.name + ")" : "")).join(", ") || "Not identified"),
        "",
        "AI summary: " + (intel.ai_summary || "N/A"),
        "",
        "Recommended actions:",
        ...((actions || []).map(a => "[" + a.priority + "] " + a.action)),
    ].join("\n");
}

interface Props {
    intel: Record<string, unknown> | null;
}

export default function AskAgent({ intel }: Props) {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const company = intel?.company as Record<string, unknown> | undefined;
    const companyName = company?.name as string | undefined;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 100);
    }, [open]);

    useEffect(() => {
        if (intel) setMessages([]);
    }, [intel]);

    const ask = async (question: string) => {
        if (!question.trim() || !intel || loading) return;
        const q = question.trim();
        setInput("");
        setMessages(prev => [...prev, { role: "user", content: q }]);
        setLoading(true);
        setMessages(prev => [...prev, { role: "agent", content: "", loading: true }]);

        const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
        try {
            const resp = await fetch(API + "/api/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: q, context: buildContext(intel) }),
            });
            const data = await resp.json();
            const answer = data.answer || "Sorry, I couldn't generate a response.";
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "agent", content: answer, loading: false };
                return updated;
            });
        } catch {
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "agent", content: "Error reaching the agent. Please try again.", loading: false };
                return updated;
            });
        } finally {
            setLoading(false);
        }
    };

    const btnTitle = intel ? ("Ask about " + (companyName || "this account")) : "Run the pipeline first";

    return (
        <>
            <button
                onClick={() => setOpen(o => !o)}
                title={btnTitle}
                style={{
                    position: "fixed", bottom: 28, right: 28,
                    width: 52, height: 52, borderRadius: "50%",
                    background: intel ? "var(--accent)" : "#888",
                    border: "2px solid rgba(255,255,255,0.3)",
                    cursor: intel ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, color: "white",
                    boxShadow: intel
                        ? "0 4px 20px rgba(0,196,140,0.5), 0 2px 8px rgba(0,0,0,0.2)"
                        : "0 2px 8px rgba(0,0,0,0.25)",
                    transition: "all 0.2s", zIndex: 1000,
                    transform: open ? "scale(0.92)" : "scale(1)",
                }}
            >
                {open ? "✕" : "✦"}
            </button>

            {open && (
                <div style={{
                    position: "fixed", bottom: 92, right: 28,
                    width: 380, maxHeight: 520,
                    background: "var(--bg2)", border: "1px solid var(--border)",
                    borderRadius: 20, boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
                    display: "flex", flexDirection: "column", overflow: "hidden",
                    zIndex: 1000,
                }}>

                    {/* Header */}
                    <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, background: "var(--accent)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "white", flexShrink: 0 }}>
                            ✦
                        </div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                                Ask about {companyName || "this account"}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text3)" }}>Agent has full intel context</div>
                        </div>
                        <div style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: "pulse-dot 1.5s ease infinite" }} />
                    </div>

                    {/* Messages */}
                    <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, minHeight: 200 }}>
                        {messages.length === 0 && (
                            <div style={{ color: "var(--text3)", fontSize: 12, textAlign: "center", marginTop: 8 }}>
                                <div style={{ marginBottom: 14, lineHeight: 1.6 }}>
                                    Ask me anything about <strong style={{ color: "var(--text)" }}>{companyName}</strong>.
                                    I have full context from the intelligence report.
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {SUGGESTED.map((s, i) => (
                                        <button
                                            key={i}
                                            onClick={() => ask(s)}
                                            style={{
                                                background: "var(--bg3)", border: "1px solid var(--border)",
                                                borderRadius: 8, padding: "7px 12px", fontSize: 12,
                                                color: "var(--text2)", cursor: "pointer", textAlign: "left",
                                                fontFamily: "var(--sans)", transition: "all 0.15s",
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                                {msg.role === "user" ? (
                                    <div style={{ background: "var(--accent)", color: "white", borderRadius: "12px 12px 2px 12px", padding: "8px 12px", fontSize: 13, maxWidth: "80%" }}>
                                        {msg.content}
                                    </div>
                                ) : (
                                    <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "12px 12px 12px 2px", padding: "10px 13px", maxWidth: "92%", color: "var(--text2)", lineHeight: 1.6 }}>
                                        {msg.loading ? (
                                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                <span style={{ fontSize: 11, color: "var(--text3)" }}>Thinking</span>
                                                <span className="thinking-dots"><span /><span /><span /></span>
                                            </div>
                                        ) : (
                                            <MarkdownBlock text={msg.content} />
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
                            placeholder="Ask about this account..."
                            disabled={loading || !intel}
                            style={{
                                flex: 1, background: "var(--bg3)", border: "1px solid var(--border)",
                                borderRadius: 10, padding: "9px 12px", fontSize: 13,
                                color: "var(--text)", fontFamily: "var(--sans)", outline: "none",
                            }}
                        />
                        <button
                            onClick={() => ask(input)}
                            disabled={loading || !input.trim() || !intel}
                            style={{
                                width: 36, height: 36, flexShrink: 0,
                                background: (input.trim() && !loading) ? "var(--accent)" : "var(--bg4)",
                                border: "none", borderRadius: 10,
                                cursor: (input.trim() && !loading) ? "pointer" : "not-allowed",
                                color: "white", fontSize: 16,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                transition: "all 0.15s",
                            }}
                        >
                            ↑
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
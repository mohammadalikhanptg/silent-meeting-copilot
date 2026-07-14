import AppShell from '../components/AppShell';

export const metadata = { title: 'Interview Mode — Silent Meeting Copilot' };

const card = {
  display: 'flex', gap: 14, alignItems: 'flex-start',
  background: 'var(--surf-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--r-lg)',
  padding: '16px 18px',
};

function Points({ points }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {points.map((p, i) => (
        <div key={i} style={card}>
          <div style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
            background: 'var(--accent-dim)', color: 'var(--accent-hi)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          }}>{i + 1}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 3 }}>{p.title}</div>
            <div style={{ fontSize: 13, color: 'var(--tx-3)', lineHeight: 1.6 }}>{p.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ModeHeader({ label, title, sub }) {
  return (
    <div style={{ margin: '30px 0 14px' }}>
      <span style={{
        display: 'inline-block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--accent-hi)',
        background: 'var(--accent-dim)', padding: '4px 12px', borderRadius: 999, marginBottom: 10,
      }}>{label}</span>
      <h2 style={{ fontFamily: 'var(--font-display, var(--font-sans))', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--tx)', margin: '0 0 4px' }}>{title}</h2>
      <p style={{ fontSize: 13.5, color: 'var(--tx-3)', margin: 0, maxWidth: 560, lineHeight: 1.6 }}>{sub}</p>
    </div>
  );
}

export default function InterviewPage() {
  return (
    <AppShell>
      <div className="shell-page" style={{ maxWidth: 760 }}>
        <div className="shell-page-header" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Verticals</p>
          <h1 className="shell-page-title" style={{ fontSize: 30 }}>Interview Mode</h1>
          <p className="shell-page-sub" style={{ fontSize: 14.5, maxWidth: 580 }}>
            One add-on, both sides of the table: coaching for the candidate, and traffic-light screening for the interviewer.
          </p>
        </div>
        <span className="shell-placeholder-pill">In development</span>

        <ModeHeader
          label="Interviewee"
          title="Perform at your best, fairly"
          sub="Delivery coaching for the candidate: it improves how you communicate what you genuinely know."
        />
        <Points points={[
          { title: 'Delivery coaching', body: 'Structure, clarity, pacing and confidence prompts tuned specifically for interview dynamics.' },
          { title: 'Your own material', body: 'Reminders drawn from your CV, your preparation notes and the job description, surfaced at the right moment.' },
          { title: 'Missed-point prompts', body: 'If you prepared a point and the moment passes without it, you get a nudge before the window closes.' },
          { title: 'Integrity by design', body: 'It coaches how you communicate what you know. It will not fabricate experience, answer test questions for you, or bypass interviewer rules.' },
        ]} />

        <ModeHeader
          label="Interviewer"
          title="Screen with confidence: the traffic-light system"
          sub="Live decision support for the person running the interview, with every signal tied to transcript evidence."
        />
        <Points points={[
          { title: 'Live traffic lights', body: 'Each answer is assessed as it lands: green, amber or red on consistency with the CV and application, depth against the job specification, and directness of the response.' },
          { title: 'Integrity signals', body: 'Contradictions with earlier answers or submitted documents, evasion patterns, and scripted or coached answer characteristics flagged in real time.' },
          { title: 'Structured interview support', body: 'Suggested probes when an answer is thin, and coverage tracking so every planned competency actually gets asked before the interview ends.' },
          { title: 'Evidence and fairness', body: 'Every rating links to the exact transcript moment, criteria stay consistent across candidates, and a full audit trail supports defensible decisions. The system advises; the human always decides.' },
        ]} />

        <p style={{ fontSize: 12.5, color: 'var(--tx-3)', marginTop: 26, lineHeight: 1.7, maxWidth: 620 }}>
          Both sides ship together in the Interview add-on, and the session type is already scaffolded in Live
          session preparation. Built for interview integrity: designed around employment-AI regulations, with the
          human decision-maker always in control, which is why recruitment teams can adopt it with confidence.
        </p>
      </div>
    </AppShell>
  );
}

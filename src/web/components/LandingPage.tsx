import React, { useEffect, useState } from 'react';
import { GitBranch, Activity, Cloud } from 'lucide-react';

interface LandingPageProps {
  onEnterDashboard: (targetPath?: string, useDemo?: boolean) => void;
}

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

// Faint code glyphs scattered behind the hero (decorative).
const GLYPHS: { t: string; top: string; left: string; size: number }[] = [
  { t: '</>', top: '9%', left: '14%', size: 34 },
  { t: '{ }', top: '11%', left: '46%', size: 30 },
  { t: '{ }', top: '9%', left: '74%', size: 30 },
  { t: '7b2a9d4', top: '10%', left: '86%', size: 22 },
  { t: 'function()', top: '17%', left: '82%', size: 22 },
  { t: '->', top: '30%', left: '3%', size: 30 },
  { t: '</>', top: '31%', left: '20%', size: 30 },
  { t: 'if (trace) {', top: '30%', left: '75%', size: 22 },
  { t: '7b2a9d4', top: '46%', left: '4%', size: 22 },
  { t: '{ }', top: '40%', left: '17%', size: 30 },
  { t: '[ ]', top: '46%', left: '90%', size: 30 },
  { t: '[ ]', top: '55%', left: '84%', size: 30 },
  { t: '-> ', top: '56%', left: '92%', size: 26 },
  { t: '7b2a9d4', top: '58%', left: '13%', size: 22 },
  { t: '</>', top: '70%', left: '9%', size: 30 },
  { t: 'function()', top: '66%', left: '72%', size: 22 },
  { t: '7b2a9d4', top: '74%', left: '80%', size: 22 },
  { t: 'if (trace) {', top: '82%', left: '30%', size: 22 },
];

// Floating programming-language logos scattered behind the hero (decorative).
const TECH: { name: string; top: string; left: string; size: number; anim: string; dur: number }[] = [
  { name: 'js', top: '16%', left: '8%', size: 46, anim: 'traceDrift1', dur: 15 },
  { name: 'ts', top: '58%', left: '6%', size: 42, anim: 'traceDrift2', dur: 18 },
  { name: 'react', top: '24%', left: '86%', size: 52, anim: 'traceDrift3', dur: 17 },
  { name: 'node', top: '68%', left: '82%', size: 46, anim: 'traceDrift1', dur: 20 },
  { name: 'py', top: '12%', left: '62%', size: 42, anim: 'traceDrift2', dur: 16 },
  { name: 'go', top: '74%', left: '40%', size: 44, anim: 'traceDrift3', dur: 19 },
  { name: 'rust', top: '30%', left: '30%', size: 40, anim: 'traceDrift1', dur: 21 },
  { name: 'html', top: '80%', left: '64%', size: 40, anim: 'traceDrift2', dur: 15 },
];

const TechLogo: React.FC<{ name: string; size: number }> = ({ name, size }) => {
  const s = size;
  switch (name) {
    case 'js':
      return (
        <svg width={s} height={s} viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#f7df1e" /><text x="16" y="24" fontFamily="monospace" fontWeight="700" fontSize="15" textAnchor="middle" fill="#0a0a0a">JS</text></svg>
      );
    case 'ts':
      return (
        <svg width={s} height={s} viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#3178c6" /><text x="16" y="24" fontFamily="monospace" fontWeight="700" fontSize="15" textAnchor="middle" fill="#ffffff">TS</text></svg>
      );
    case 'react':
      return (
        <svg width={s} height={s} viewBox="-24 -24 48 48"><circle r="4.5" fill="#61dafb" /><g stroke="#61dafb" strokeWidth="2" fill="none"><ellipse rx="22" ry="8.5" /><ellipse rx="22" ry="8.5" transform="rotate(60)" /><ellipse rx="22" ry="8.5" transform="rotate(120)" /></g></svg>
      );
    case 'node':
      return (
        <svg width={s} height={s} viewBox="0 0 32 32"><path d="M16 2 L28 9 V23 L16 30 L4 23 V9 Z" fill="#539e43" /><text x="16" y="20" fontFamily="monospace" fontWeight="700" fontSize="8" textAnchor="middle" fill="#ffffff">node</text></svg>
      );
    case 'py':
      return (
        <svg width={s} height={s} viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#3776ab" /><text x="16" y="23" fontFamily="monospace" fontWeight="700" fontSize="14" textAnchor="middle" fill="#ffd43b">Py</text></svg>
      );
    case 'go':
      return (
        <svg width={s} height={s} viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#00add8" /><text x="16" y="22" fontFamily="monospace" fontWeight="700" fontSize="12" textAnchor="middle" fill="#ffffff">Go</text></svg>
      );
    case 'rust':
      return (
        <svg width={s} height={s} viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#0a0a0a" /><text x="16" y="22" fontFamily="monospace" fontWeight="700" fontSize="14" textAnchor="middle" fill="#ffffff">Rs</text></svg>
      );
    case 'html':
      return (
        <svg width={s} height={s} viewBox="0 0 32 32"><path d="M5 3 L27 3 L25 27 L16 30 L7 27 Z" fill="#e34f26" /><path d="M16 6 V27 L23 25 L24.5 6 Z" fill="#ef652a" /><text x="16" y="19" fontFamily="monospace" fontWeight="700" fontSize="11" textAnchor="middle" fill="#ffffff">5</text></svg>
      );
    default:
      return null;
  }
};

const StatusPill: React.FC = () => {
  const [label, setLabel] = useState('HydraDB Ready');
  const [dot, setDot] = useState('#6366f1');

  useEffect(() => {
    let alive = true;
    fetch('/api/hydra/ping')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const s = d?.storageMode?.status;
        if (s === 'Connected') {
          setLabel('HydraDB Connected');
          setDot('#34d399');
        } else if (s === 'Configured') {
          setLabel('HydraDB Ready');
          setDot('#6366f1');
        } else {
          setLabel('Local Mode');
          setDot('#71717a');
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: MONO,
        fontSize: 12,
        padding: '5px 10px',
        borderRadius: 9999,
        background: 'rgba(99,102,241,0.08)',
        border: '1px solid rgba(99,102,241,0.20)',
        color: '#3f3f46',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 9999, background: dot, boxShadow: `0 0 6px ${dot}` }} />
      {label}
    </span>
  );
};

const Badge: React.FC<{ kind: 'verified' | 'unobserved' }> = ({ kind }) => {
  const v = kind === 'verified';
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: 5,
        letterSpacing: '0.04em',
        background: v ? '#059669' : '#3f3f46',
        color: v ? '#ecfdf5' : '#d4d4d8',
        whiteSpace: 'nowrap',
      }}
    >
      {v ? '[ VERIFIED ]' : '[ UNOBSERVED ]'}
    </span>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterDashboard }) => {
  const [pathValue, setPathValue] = useState('');
  const [analyzeHover, setAnalyzeHover] = useState(false);

  const analyze = () => {
    const p = pathValue.trim();
    if (!p || p === 'demo' || p.includes('demo-app')) {
      onEnterDashboard(undefined, true);
    } else {
      onEnterDashboard(p, false);
    }
  };

  const bg = '#ffffff';
  const cardBg = '#ffffff';
  const border = '#e6e6e9';
  const textMain = '#0a0a0a';
  const textMuted = '#52525b';
  const textDim = '#a1a1aa';
  const nodeBg = '#fafafa';

  const node = (): React.CSSProperties => ({
    fontFamily: MONO,
    fontSize: 13,
    padding: '8px 12px',
    borderRadius: 8,
    background: nodeBg,
    border: `1px solid ${border}`,
    color: textMain,
    whiteSpace: 'nowrap',
    display: 'inline-block',
  });

  return (
    <div className="landing-container" style={{ background: bg, color: textMain, minHeight: '100vh', height: '100vh', width: '100vw', fontFamily: SANS, overflowX: 'hidden', overflowY: 'auto', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes traceFloatA { 0%,100%{transform:translate(0,0)} 50%{transform:translate(70px,-56px)} }
        @keyframes traceFloatB { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-64px,48px)} }
        @keyframes traceFloatC { 0%,100%{transform:translate(0,0)} 50%{transform:translate(50px,60px)} }
        @keyframes traceDrift1 { 0%,100%{transform:translate(0,0) rotate(-6deg)} 50%{transform:translate(26px,-34px) rotate(8deg)} }
        @keyframes traceDrift2 { 0%,100%{transform:translate(0,0) rotate(5deg)} 50%{transform:translate(-30px,-22px) rotate(-7deg)} }
        @keyframes traceDrift3 { 0%,100%{transform:translate(0,0) rotate(-4deg)} 50%{transform:translate(22px,30px) rotate(9deg)} }

        /* Hide background tech logos, 3 feature cards, and plain secondary links on mobile for single-line header fit */
        @media (max-width: 768px) {
          .landing-container { min-height: 100vh !important; height: auto !important; }
          .landing-deco-hide { display: none !important; }
          .landing-feature-band { display: none !important; }
          .mobile-nav-hide { display: none !important; }
          .landing-header { padding: 12px 16px !important; }
          .landing-hero { padding: 10px 16px 20px !important; justify-content: flex-start !important; flex: 1 0 auto !important; }
          .landing-action-row { flex-direction: column !important; width: 100% !important; margin-top: 14px !important; }
          .landing-input { width: 100% !important; flex: 1 1 100% !important; }
          .landing-button { width: 100% !important; }
          .landing-demo-card { margin-top: 14px !important; }
          .landing-mobile-footer { display: flex !important; }
        }
      `}</style>

      {/* Top bar */}
      <header
        className="landing-header"
        style={{
          position: 'relative',
          zIndex: 2,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 40px',
          gap: 12,
          flexWrap: 'nowrap',
        }}
      >
        <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, letterSpacing: '0.02em', cursor: 'pointer', flexShrink: 0 }} onClick={() => onEnterDashboard(undefined, true)}>
          TRACE <span style={{ color: textDim, fontWeight: 400, fontSize: 13 }}>[v0.1.0]</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 13, color: textMuted, flexShrink: 0 }}>
          <button
            onClick={() => onEnterDashboard(undefined, true)}
            style={{
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 12px',
              borderRadius: 8,
              background: '#0a0a0a',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            [ Open Dashboard ]
          </button>
          <span className="mobile-nav-hide" style={{ cursor: 'pointer' }} onClick={() => onEnterDashboard(undefined, true)}>[ Docs ]</span>
          <a className="mobile-nav-hide" href="https://github.com/mzterwalexzyy/trace" target="_blank" rel="noreferrer" style={{ color: textMuted, textDecoration: 'none' }}>[ GitHub ]</a>
          <StatusPill />
        </div>
      </header>

      {/* Hero */}
      <section className="landing-hero" style={{ position: 'relative', padding: '12px 24px 24px', flex: '1 1 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {/* Decorative backdrop */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
          {/* floating colored glows */}
          <div style={{ position: 'absolute', top: '-10%', left: '0%', width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.35), transparent 60%)', filter: 'blur(18px)', animation: 'traceFloatA 14s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', top: '-6%', right: '-2%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(56,189,248,0.30), transparent 60%)', filter: 'blur(18px)', animation: 'traceFloatB 17s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', bottom: '-16%', left: '14%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.25), transparent 60%)', filter: 'blur(22px)', animation: 'traceFloatC 20s ease-in-out infinite' }} />

          {/* faint code glyphs (hidden on mobile) */}
          <div className="landing-deco-hide">
            {GLYPHS.map((g, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  top: g.top,
                  left: g.left,
                  fontFamily: MONO,
                  fontSize: g.size,
                  color: '#0a0a0a',
                  opacity: 0.07,
                  userSelect: 'none',
                }}
              >
                {g.t}
              </span>
            ))}
            {/* floating language logos (hidden on mobile) */}
            {TECH.map((t, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: t.top,
                  left: t.left,
                  opacity: 0.55,
                  animation: `${t.anim} ${t.dur}s ease-in-out infinite`,
                  filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.10))',
                }}
              >
                <TechLogo name={t.name} size={t.size} />
              </div>
            ))}
          </div>

          {/* soft white vignette */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(115% 78% at 50% 42%, rgba(255,255,255,0.70) 24%, rgba(255,255,255,0.15) 70%, transparent 100%)' }} />
        </div>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 980, margin: '0 auto', textAlign: 'center', width: '100%' }}>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 11.5,
              letterSpacing: '0.16em',
              color: textMuted,
              padding: '6px 14px',
              border: `1px solid ${border}`,
              borderRadius: 9999,
              display: 'inline-block',
            }}
          >
            ENGINEERING INTELLIGENCE
          </span>

          <h1
            style={{
              fontFamily: SANS,
              fontWeight: 800,
              fontSize: 'clamp(1.75rem, 5.2vw, 3.8rem)',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
              margin: '14px 0 0',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            Know what your code change touches.
          </h1>

          <p style={{ fontFamily: MONO, fontSize: 'clamp(0.85rem, 1.4vw, 1.05rem)', color: textMuted, margin: '14px auto 0', maxWidth: 640, lineHeight: 1.5 }}>
            Deterministic AST dependency mapping meets real execution evidence.
          </p>

          {/* Action row */}
          <div className="landing-action-row" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', margin: '20px auto 0', maxWidth: 700 }}>
            <input
              className="landing-input"
              value={pathValue}
              onChange={(e) => setPathValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && analyze()}
              placeholder="[ /projects/demo-app ]"
              spellCheck={false}
              style={{
                flex: '1 1 300px',
                fontFamily: MONO,
                fontSize: 14,
                padding: '12px 16px',
                borderRadius: 10,
                background: '#ffffff',
                border: `1px solid ${border}`,
                color: textMain,
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#0a0a0a')}
              onBlur={(e) => (e.currentTarget.style.borderColor = border)}
            />
            <button
              className="landing-button"
              onClick={analyze}
              onMouseEnter={() => setAnalyzeHover(true)}
              onMouseLeave={() => setAnalyzeHover(false)}
              style={{
                fontFamily: MONO,
                fontSize: 14,
                fontWeight: 600,
                padding: '12px 20px',
                borderRadius: 10,
                background: analyzeHover ? '#26262b' : '#0a0a0a',
                color: '#fafafa',
                border: '1px solid #0a0a0a',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 120ms ease',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
              }}
            >
              [ Analyze Repository ]
            </button>
          </div>

          {/* Demo card */}
          <div
            className="landing-demo-card"
            style={{
              margin: '16px auto 0',
              maxWidth: 780,
              width: '100%',
              textAlign: 'left',
              background: cardBg,
              border: `1px solid ${border}`,
              borderRadius: 14,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${border}` }}>
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 15 }}>Trace Calculation Demo</span>
            </div>

            <div style={{ padding: '14px 16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowX: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 'fit-content' }}>
                {/* Left node */}
                <div style={node()}>calculateTax()</div>

                {/* Connectors */}
                <svg width="60" height="96" viewBox="0 0 80 112" style={{ flexShrink: 0 }} aria-hidden>
                  <path d="M0 56 C36 56 44 26 80 26" fill="none" stroke={border} strokeWidth="1.5" />
                  <path d="M0 56 C36 56 44 86 80 86" fill="none" stroke={border} strokeWidth="1.5" />
                </svg>

                {/* Right nodes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 8, background: nodeBg, border: `1px solid ${border}` }}>
                    <span style={{ fontFamily: MONO, fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>POST</span> /api/checkout
                    </span>
                    <Badge kind="verified" />
                    <span style={{ fontFamily: MONO, fontSize: 12, color: textDim, marginLeft: 'auto' }}>14ms</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 8, background: nodeBg, border: `1px solid ${border}` }}>
                    <span style={{ fontFamily: MONO, fontSize: 13, color: textMuted }}>
                      <span style={{ fontWeight: 600 }}>POST</span> /api/invoice
                    </span>
                    <Badge kind="unobserved" />
                    <span style={{ fontFamily: MONO, fontSize: 12, color: textDim, marginLeft: 'auto' }}>AST call</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature band (Desktop only — hidden on mobile via CSS) */}
      <section
        className="landing-feature-band"
        style={{
          flexShrink: 0,
          background: '#fafafa',
          color: '#0a0a0a',
          borderTop: '1px solid #ececec',
          padding: '14px 40px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 32,
          }}
        >
          {[
            { n: '01', icon: <GitBranch size={20} strokeWidth={1.75} />, title: 'DETERMINISTIC GRAPH', desc: 'AST-derived dependency blast radius, computed locally and exactly.' },
            { n: '02', icon: <Activity size={20} strokeWidth={1.75} />, title: 'RUNTIME EVIDENCE', desc: 'Real execution traces separate what can run from what did run.' },
            { n: '03', icon: <Cloud size={20} strokeWidth={1.75} />, title: 'HYDRADB CONTEXT', desc: 'Cloud contextual retrieval without slowing local analysis.' },
          ].map((f) => (
            <div key={f.n} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: '#0a0a0a' }}>{f.icon}</span>
                <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>
                  <span style={{ color: '#a1a1aa' }}>{f.n} / </span>
                  {f.title}
                </span>
              </div>
              <p style={{ fontFamily: MONO, fontSize: 13.5, lineHeight: 1.6, color: '#52525b', maxWidth: 320 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mobile footer bar */}
      <footer
        className="landing-mobile-footer"
        style={{
          display: 'none',
          padding: '14px 20px',
          borderTop: '1px solid #e6e6e9',
          background: '#fafafa',
          fontSize: '12px',
          fontFamily: MONO,
          color: textMuted,
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 'auto',
          flexShrink: 0,
        }}
      >
        <span>TRACE [v0.1.0]</span>
        <span>AST &amp; Runtime Engine</span>
      </footer>
    </div>
  );
};

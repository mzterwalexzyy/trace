import React from 'react';
import { ArrowLeft, Boxes, Activity, Database, ShieldAlert, Github, Sparkles } from 'lucide-react';

interface AboutProps {
  onBack: () => void;
}

const GITHUB = 'https://github.com/mzterwalexzyy/trace';

const wrap: React.CSSProperties = { maxWidth: '820px', margin: '0 auto', padding: '0 24px' };
const h2: React.CSSProperties = { fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', color: '#0a0a0a', margin: '0 0 12px' };
const p: React.CSSProperties = { fontSize: '15px', lineHeight: 1.7, color: '#3f3f46', margin: '0 0 14px' };

export const About: React.FC<AboutProps> = ({ onBack }) => {
  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#0a0a0a', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top bar */}
      <div style={{ borderBottom: '1px solid #ececee', position: 'sticky', top: 0, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(6px)', zIndex: 10 }}>
        <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' }}>
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: '#0a0a0a', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
            <ArrowLeft size={16} /> TRACE
          </button>
          <a href={GITHUB} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#52525b', textDecoration: 'none' }}>
            <Github size={15} /> GitHub
          </a>
        </div>
      </div>

      {/* Hero */}
      <div style={{ ...wrap, paddingTop: '56px', paddingBottom: '20px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#71717a', border: '1px solid #ececee', borderRadius: '999px', padding: '5px 12px', marginBottom: '18px' }}>
          <Sparkles size={13} /> Engineering intelligence
        </div>
        <h1 style={{ fontSize: '38px', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 16px' }}>
          Know what your code change touches — before it ships.
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.6, color: '#52525b', margin: 0 }}>
          TRACE maps your codebase, observes what actually runs, and shows the real blast radius of a change:
          what <strong style={{ color: '#0a0a0a' }}>could</strong> break versus what you have <strong style={{ color: '#0a0a0a' }}>evidence</strong> is exercised.
        </p>
      </div>

      {/* The problem */}
      <div style={{ ...wrap, paddingTop: '40px' }}>
        <h2 style={h2}>Why TRACE exists</h2>
        <p style={p}>
          Before you change a function, you want two answers: <em>what depends on this?</em> and <em>which of those paths
          actually run?</em> Static search tells you what’s <em>possible</em>. It can’t tell you what’s <em>real</em>.
          TRACE answers both, and — crucially — keeps them apart, so a code relationship is never mistaken for proof
          that a path executes in production.
        </p>
      </div>

      {/* Three pillars */}
      <div style={{ ...wrap, paddingTop: '32px' }}>
        <h2 style={h2}>How it works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginTop: '6px' }}>
          {[
            { icon: <Boxes size={20} />, t: 'Static graph', d: 'Deterministic AST analysis builds the exact dependency graph — files, functions, endpoints, database operations, tests — and a bounded blast-radius traversal over it. This is what a change could affect.' },
            { icon: <Activity size={20} />, t: 'Runtime traces', d: 'Instrumented executions record the real call tree with durations and nesting. This is what actually ran.' },
            { icon: <ShieldAlert size={20} />, t: 'The intersection', d: 'TRACE overlays the two: every affected path is marked VERIFIED (seen at runtime) or UNOBSERVED (a blind spot). That distinction is the product.' },
          ].map((c) => (
            <div key={c.t} style={{ border: '1px solid #ececee', borderRadius: '12px', padding: '18px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f7f7f8', border: '1px solid #ececee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0a0a', marginBottom: '12px' }}>{c.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>{c.t}</div>
              <div style={{ fontSize: '13px', lineHeight: 1.55, color: '#52525b' }}>{c.d}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '20px', padding: '16px 18px', background: '#f7f7f8', border: '1px solid #ececee', borderRadius: '12px', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', color: '#3f3f46', lineHeight: 1.7 }}>
          Static graph = <strong style={{ color: '#0a0a0a' }}>what CAN happen</strong>.<br />
          Runtime traces = <strong style={{ color: '#0a0a0a' }}>what DID happen</strong>.<br />
          TRACE = the intersection → <span style={{ color: '#059669' }}>VERIFIED</span> / <span style={{ color: '#b45309' }}>UNOBSERVED</span>.
        </div>
      </div>

      {/* HydraDB — its importance */}
      <div style={{ ...wrap, paddingTop: '44px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}><Database size={20} /></div>
          <h2 style={{ ...h2, margin: 0 }}>The role of HydraDB</h2>
        </div>
        <p style={p}>
          The deterministic parts of TRACE — the AST graph, the blast-radius traversal, the VERIFIED/UNOBSERVED
          classification — run locally and are exact. But a real codebase carries <strong style={{ color: '#0a0a0a' }}>context</strong>
          that a raw graph can’t hold: what a symbol is <em>for</em>, how a feature has evolved, the notes and history
          that make a change safe to reason about. That’s what <strong style={{ color: '#0a0a0a' }}>HydraDB</strong> provides.
        </p>
        <p style={p}>
          On every analysis, TRACE ingests a searchable document per symbol into HydraDB — scoped by symbol, file, and
          commit. When you inspect an impact report or ask a question in natural language, TRACE queries HydraDB for the
          most relevant context and folds it into the answer. It’s the memory layer that turns a dependency graph into
          an <strong style={{ color: '#0a0a0a' }}>engineering intelligence platform</strong>: the graph knows the
          structure, HydraDB knows the story.
        </p>
        <p style={p}>
          Why it matters for TRACE specifically: retrieval quality is the difference between “here are 40 affected
          nodes” and “here’s the affected code, and here’s the context you need to judge the change.” HydraDB is what
          lets <strong style={{ color: '#0a0a0a' }}>Ask TRACE</strong> stay grounded — the AI never invents facts; it
          explains the deterministic evidence plus the real context HydraDB retrieved. TRACE is the intelligence and
          evidence engine; HydraDB is the context substrate that powers it.
        </p>
        <div style={{ marginTop: '8px', padding: '14px 18px', background: '#f7f7f8', border: '1px solid #ececee', borderRadius: '12px', fontSize: '13px', color: '#52525b', lineHeight: 1.6 }}>
          <strong style={{ color: '#0a0a0a' }}>Honest boundary:</strong> HydraDB does not run TRACE’s graph traversal or
          Cypher. TRACE computes structure and impact deterministically; HydraDB ingests and retrieves context to
          enrich it. TRACE degrades gracefully to a fully local mode when HydraDB isn’t configured.
        </div>
      </div>

      {/* What you can do */}
      <div style={{ ...wrap, paddingTop: '44px', paddingBottom: '64px' }}>
        <h2 style={h2}>What you can do in TRACE</h2>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            ['Analyze a repository', 'Point TRACE at a local folder or a public Git URL. It parses the AST and builds the graph.'],
            ['Change Impact', 'Pick a function, file or endpoint and see affected nodes, endpoints, DB dependencies, and VERIFIED vs UNOBSERVED routes.'],
            ['Architecture', 'Explore the interactive dependency graph; focus a symbol to see its callers and callees.'],
            ['Runtime', 'Record a real execution (or import a trace) and watch the call-tree waterfall.'],
            ['Ask TRACE', 'Ask in plain English. TRACE gathers real evidence and (optionally) an AI layer explains it — grounded, never invented.'],
          ].map(([t, d]) => (
            <li key={t} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', border: '1px solid #ececee', borderRadius: '10px', padding: '13px 16px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0a0a0a', minWidth: '150px' }}>{t}</span>
              <span style={{ fontSize: '13px', color: '#52525b', lineHeight: 1.5 }}>{d}</span>
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: '10px', marginTop: '28px', flexWrap: 'wrap' }}>
          <button onClick={onBack} style={{ background: '#0a0a0a', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '11px 20px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
            Open TRACE
          </button>
          <a href={GITHUB} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: '#ffffff', color: '#0a0a0a', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '11px 20px', fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}>
            <Github size={15} /> View source
          </a>
        </div>
      </div>
    </div>
  );
};

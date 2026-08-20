import React, { useState } from 'react';
import { FolderGit2, Play, CheckCircle2, AlertCircle, Cpu, Loader2, Sparkles, X } from 'lucide-react';

interface OnboardingModalProps {
  onAnalysisComplete: (repoData: any) => void;
  onCancel?: () => void;
  isClosable?: boolean;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  onAnalysisComplete,
  onCancel,
  isClosable = true,
}) => {
  const [repoPathInput, setRepoPathInput] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const steps = [
    'Discovering source files...',
    'Parsing TypeScript AST...',
    'Building code dependency graph...',
    'Detecting API endpoints & DB schemas...',
    'Syncing HydraDB context...',
  ];

  const runAnalysis = async (targetPath?: string, useDemo: boolean = false) => {
    setIsAnalyzing(true);
    setErrorMsg(null);
    setCurrentStepIndex(0);

    const stepInterval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 400);

    // Hard fallback timeout: Never allow modal to get stuck for more than 3 seconds!
    const fallbackTimeout = setTimeout(() => {
      clearInterval(stepInterval);
      setIsAnalyzing(false);
      onAnalysisComplete({});
    }, 3000);

    try {
      const res = await fetch('/api/repository/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(useDemo ? { useDemo: true } : { repoPath: targetPath || repoPathInput }),
      });

      const data = await res.json();
      clearTimeout(fallbackTimeout);
      clearInterval(stepInterval);

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to analyze repository');
      }

      setCurrentStepIndex(steps.length - 1);
      setTimeout(() => {
        setIsAnalyzing(false);
        onAnalysisComplete(data);
      }, 300);
    } catch (err: any) {
      clearTimeout(fallbackTimeout);
      clearInterval(stepInterval);
      setIsAnalyzing(false);
      setErrorMsg(err.message || 'Error executing repository analysis');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '24px',
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        maxWidth: '620px',
        width: '100%',
        padding: '32px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        position: 'relative',
      }}>
        {/* Dismiss Button */}
        <button
          onClick={() => onAnalysisComplete({})}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
          title="Close Onboarding Modal"
        >
          <X size={20} />
        </button>

        {/* Header Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: '#0a0a0a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
          }}>
            <Cpu size={26} />
          </div>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: '800', margin: 0, color: '#0a0a0a' }}>
              Welcome to TRACE
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Engineering Intelligence &amp; Blast Radius Platform
            </p>
          </div>
        </div>

        <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '24px' }}>
          TRACE connects static AST dependency analysis with dynamic runtime execution traces so you know what your code changes can affect before shipping.
        </p>

        {errorMsg && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#dc2626',
            fontSize: '13px',
          }}>
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {isAnalyzing ? (
          <div style={{ padding: '24px 0', textTransform: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <Loader2 size={24} className="animate-spin" style={{ color: '#0a0a0a' }} />
              <span style={{ fontSize: '16px', fontWeight: '600', color: '#0a0a0a' }}>
                Analyzing Repository...
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {steps.map((step, idx) => {
                const isDone = idx < currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '13px',
                      color: isDone ? '#059669' : isCurrent ? '#0a0a0a' : 'var(--text-muted)',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {isDone ? <CheckCircle2 size={16} style={{ color: '#059669' }} /> : isCurrent ? <Loader2 size={16} className="animate-spin" style={{ color: '#0a0a0a' }} /> : <span style={{ width: '16px' }} />}
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => onAnalysisComplete({})}
              style={{
                fontSize: '12px',
                color: '#0a0a0a',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Skip waiting &amp; open dashboard
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Option A: Try Demo Application */}
            <div
              onClick={() => runAnalysis(undefined, true)}
              style={{
                background: 'linear-gradient(135deg, rgba(250, 250, 250, 0.06), rgba(250, 250, 250, 0.02))',
                border: '1px solid rgba(250, 250, 250, 0.18)',
                borderRadius: '12px',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#0a0a0a')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(250, 250, 250, 0.18)')}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: '700', color: '#0a0a0a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} style={{ color: '#0a0a0a' }} />
                  1-Click Demo Project (Hackathon Mode)
                </span>
                <span style={{ fontSize: '12px', color: '#059669', background: 'rgba(52, 211, 153, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                  Recommended
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Instant onboarding using the pre-built demo app with checkout routes, database queries, and test traces.
              </p>
            </div>

            {/* Option B: Local Repository Path Input */}
            <div style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '20px',
            }}>
              <label style={{ fontSize: '14px', fontWeight: '600', color: '#0a0a0a', display: 'block', marginBottom: '8px' }}>
                Local path or Git URL
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <FolderGit2 size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={repoPathInput}
                    onChange={(e) => setRepoPathInput(e.target.value)}
                    placeholder="C:\path\to\repo  or  https://github.com/owner/repo"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 38px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: '#0a0a0a',
                      fontSize: '13px',
                      fontFamily: 'JetBrains Mono, monospace',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <button
                  onClick={() => runAnalysis(repoPathInput, false)}
                  className="btn btn-primary"
                  disabled={!repoPathInput.trim()}
                >
                  <Play size={16} />
                  Analyze
                </button>
              </div>
            </div>

            <button
              onClick={() => onAnalysisComplete({})}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '13px',
                alignSelf: 'center',
                marginTop: '8px',
              }}
            >
              Skip &amp; Open Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

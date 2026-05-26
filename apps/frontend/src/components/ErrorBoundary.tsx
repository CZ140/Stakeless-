import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

// Top-level error boundary: catches any render/lifecycle error in the tree below
// it so a single broken component shows a recoverable fallback instead of a blank
// white screen. (Event-handler and async errors aren't caught by React boundaries
// — those still surface via toasts / the global handlers.)
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Last-resort logging. A production app would forward this to Sentry/etc.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'var(--bg, #0c0e13)',
          color: 'var(--text, #e7e9ee)',
        }}
      >
        <div
          style={{
            maxWidth: 460,
            textAlign: 'center',
            background: 'var(--surface, #161922)',
            border: '1px solid var(--border, #262b38)',
            borderRadius: 14,
            padding: '32px 28px',
          }}
        >
          <div style={{ fontSize: 34, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 20, margin: '0 0 10px' }}>Something went wrong</h1>
          <p style={{ color: 'var(--text-muted, #9aa3b2)', fontSize: 14, lineHeight: 1.5, margin: '0 0 20px' }}>
            The page hit an unexpected error. Reloading usually fixes it — your balance and account
            are safe.
          </p>
          {import.meta.env.DEV && (
            <pre
              style={{
                textAlign: 'left',
                fontSize: 12,
                color: 'var(--loss, #ff6b6b)',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
                overflow: 'auto',
                maxHeight: 160,
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
            style={{ padding: '10px 22px' }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

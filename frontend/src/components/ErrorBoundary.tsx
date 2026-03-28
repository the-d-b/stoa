import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return this.props.fallback || (
        <div style={{
          padding: 24, margin: 16, borderRadius: 10,
          background: '#f8717110', border: '1px solid #f8717140',
          color: 'var(--red)', fontFamily: 'DM Mono, monospace', fontSize: 13,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Render error</div>
          <div style={{ opacity: 0.8 }}>{this.state.error.message}</div>
          <div style={{ marginTop: 12, opacity: 0.5, fontSize: 11, whiteSpace: 'pre-wrap' }}>
            {this.state.error.stack?.split('\n').slice(0, 5).join('\n')}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 12, background: 'none', border: '1px solid #f8717140',
              color: 'var(--red)', borderRadius: 6, padding: '4px 12px',
              cursor: 'pointer', fontSize: 12,
            }}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

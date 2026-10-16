import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// If anything on a screen fails, show a way back instead of a blank page. Progress is saved on the device as it
// happens, so a reload loses at most the session that was running.
class Guard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <main className="rules">
          <h1>Something went wrong</h1>
          <p>Your progress is saved on this device. Reload to carry on.</p>
          <p className="note">{String(this.state.error.message || this.state.error).slice(0, 200)}</p>
          <button className="primary" onClick={() => location.reload()}>Reload</button>
        </main>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(<StrictMode><Guard><App /></Guard></StrictMode>);

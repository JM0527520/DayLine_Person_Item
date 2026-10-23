import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './refinement.css';
import './themes.css';
import './modules.css';
import './scrollbars.css';
import './workspace.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <main className="fatal"><h1>页面暂时无法显示</h1><p>请重新加载页面。本地保存的任务不会因此删除。</p><button onClick={() => location.reload()}>重新加载</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);

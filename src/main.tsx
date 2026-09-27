import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

async function mountApp() {
  if (import.meta.env.DEV && import.meta.env.MODE === 'demo') {
    const { prepareDemo } = await import('./demo/bootstrap');
    await prepareDemo();
  }
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
}
void mountApp();

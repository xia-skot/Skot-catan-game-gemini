import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Cancel browser zoom without swallowing either click or the map's touch events.
const preventBrowserZoom = (event: Event) => event.preventDefault();
document.addEventListener('dblclick', preventBrowserZoom, { passive: false });
document.addEventListener('gesturestart', preventBrowserZoom, { passive: false });
document.addEventListener('gesturechange', preventBrowserZoom, { passive: false });
if (import.meta.hot) import.meta.hot.dispose(() => {
  document.removeEventListener('dblclick', preventBrowserZoom);
  document.removeEventListener('gesturestart', preventBrowserZoom);
  document.removeEventListener('gesturechange', preventBrowserZoom);
});

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

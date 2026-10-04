import {StrictMode, Suspense, lazy, useCallback, useState} from 'react';
import {createRoot} from 'react-dom/client';
import { StartupScreen } from './components/StartupScreen';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

const App = lazy(() => import('./App.tsx'));

function ApplicationRoot() {
  const [accountReady, setAccountReady] = useState(false);
  const [startupFinished, setStartupFinished] = useState(false);
  const handleAccountReady = useCallback(() => setAccountReady(true), []);
  return <>
    <div inert={!startupFinished} style={{ visibility: startupFinished ? 'visible' : 'hidden' }}>
      <Suspense fallback={null}><App onAccountReady={handleAccountReady} startupFinished={startupFinished} /></Suspense>
    </div>
    {!startupFinished && <StartupScreen waitingForAccount={!accountReady} onComplete={() => setStartupFinished(true)} />}
  </>;
}

// Cancel browser zoom without swallowing either click or the map's touch events.
const preventBrowserZoom = (event: Event) => event.preventDefault();
document.addEventListener('dblclick', preventBrowserZoom, { passive: false });
document.addEventListener('gesturestart', preventBrowserZoom, { passive: false });
document.addEventListener('gesturechange', preventBrowserZoom, { passive: false });
const preventPagePinch = (event: TouchEvent) => {
  // Canvas owns its own pinch gesture; native page zoom is never needed there either.
  if (event.touches.length > 1 && event.cancelable) event.preventDefault();
};
document.addEventListener('touchmove', preventPagePinch, { passive: false });
if (import.meta.hot) import.meta.hot.dispose(() => {
  document.removeEventListener('dblclick', preventBrowserZoom);
  document.removeEventListener('gesturestart', preventBrowserZoom);
  document.removeEventListener('gesturechange', preventBrowserZoom);
  document.removeEventListener('touchmove', preventPagePinch);
});

async function mountApp() {
  if (import.meta.env.DEV && import.meta.env.MODE === 'demo') {
    const { prepareDemo } = await import('./demo/bootstrap');
    await prepareDemo();
  }
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ApplicationRoot />
    </ErrorBoundary>
  </StrictMode>,
);
}
void mountApp();

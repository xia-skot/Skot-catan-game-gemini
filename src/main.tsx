import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import { StartupScreen } from './components/StartupScreen';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

const App = lazy(() => import('./App.tsx'));

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
      <Suspense fallback={<StartupScreen waitingForAccount waitingLabel="资源已就绪，正在加载游戏程序…" onComplete={() => {}} />}>
        <App />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);
}
void mountApp();

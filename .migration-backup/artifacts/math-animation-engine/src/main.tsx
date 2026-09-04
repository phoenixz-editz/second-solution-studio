import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

if (typeof document !== 'undefined') {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    createRoot(rootElement, {
      // Keeps caught errors off reportError(), which would raise the dev overlay.
      onCaughtError: (error, errorInfo) => {
        console.error(error, errorInfo.componentStack);
      },
    }).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
    );
  }
}

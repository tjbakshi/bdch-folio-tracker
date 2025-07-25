import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { initSentry } from './lib/sentry'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// Initialize logging
initSentry()

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

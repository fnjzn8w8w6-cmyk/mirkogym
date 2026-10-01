import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/unbounded/700.css';
import '@fontsource/unbounded/800.css';
import './index.css';
import App from './App';
import { setupUpdates } from './lib/pwa-update';

setupUpdates();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initAuth } from './lib/auth';
import './lib/prefs'; // applies the saved light/dark theme before first paint
import './styles.css';

initAuth();

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

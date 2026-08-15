import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './app/App';
import { Lock } from './app/Lock';
import { DbProvider } from './data/store';
import { ToastHost } from './ui/primitives';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastHost>
      <Lock>
        <DbProvider>
          <App />
        </DbProvider>
      </Lock>
    </ToastHost>
  </StrictMode>
);

import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppProviders } from './app/providers/app-providers';
import { AppRoutes } from './app/router/app-routes';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el punto de montaje de la aplicación.');

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  </StrictMode>,
);

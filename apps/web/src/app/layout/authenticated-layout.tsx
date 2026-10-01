import { Outlet } from 'react-router';
import { ApplicationFrame } from './application-frame';

// Base estructural reservada para Fase 1; no autentica ni protege rutas.
export function AuthenticatedLayout() {
  return <ApplicationFrame><Outlet /></ApplicationFrame>;
}

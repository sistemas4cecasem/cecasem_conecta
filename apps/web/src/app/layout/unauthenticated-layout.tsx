import { Outlet } from 'react-router';
import { ApplicationFrame } from './application-frame';

export function UnauthenticatedLayout() {
  return <ApplicationFrame><Outlet /></ApplicationFrame>;
}

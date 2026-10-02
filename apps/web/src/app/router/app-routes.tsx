import { Route, Routes } from 'react-router';
import { HomePage } from '../../features/home/home-page';
import { UnauthenticatedLayout } from '../layout/unauthenticated-layout';
import { NotFoundPage } from './not-found-page';
import { AuthenticatedLayout } from '../layout/authenticated-layout';
import { LoginPage } from '../../features/auth/login-page';
import { FirstAccessPage } from '../../features/auth/first-access-page';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<UnauthenticatedLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="first-access" element={<FirstAccessPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<AuthenticatedLayout />}>
        <Route index element={<HomePage />} />
      </Route>
    </Routes>
  );
}

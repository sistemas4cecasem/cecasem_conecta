import { Route, Routes } from 'react-router';
import { HomePage } from '../../features/home/home-page';
import { UnauthenticatedLayout } from '../layout/unauthenticated-layout';
import { NotFoundPage } from './not-found-page';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<UnauthenticatedLayout />}>
        <Route index element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

import { Route, Routes } from 'react-router';
import { HomePage } from '../../features/home/home-page';
import { UnauthenticatedLayout } from '../layout/unauthenticated-layout';
import { NotFoundPage } from './not-found-page';
import { AuthenticatedLayout } from '../layout/authenticated-layout';
import { LoginPage } from '../../features/auth/login-page';
import { FirstAccessPage } from '../../features/auth/first-access-page';
import { ResetPasswordPage } from '../../features/auth/reset-password-page';
import { UsersPage } from '../../features/users/users-page';
import { OrganizationsPage, OrganizationCreationPage } from '../../features/directory/organizations-page';
import { OrganizationDetailPage } from '../../features/directory/organization-detail-page';
import { CategoriesPage } from '../../features/directory/categories-page';
import { PeoplePage, PersonCreationPage } from '../../features/directory/people-page';
import { PersonDetailPage } from '../../features/directory/person-detail-page';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<UnauthenticatedLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="first-access" element={<FirstAccessPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<AuthenticatedLayout />}>
        <Route index element={<HomePage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="organizations" element={<OrganizationsPage />} />
        <Route path="organizations/new" element={<OrganizationCreationPage />} />
        <Route path="organizations/categories" element={<CategoriesPage />} />
        <Route path="organizations/:id" element={<OrganizationDetailPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="people/new" element={<PersonCreationPage />} />
        <Route path="people/:id" element={<PersonDetailPage />} />
      </Route>
    </Routes>
  );
}

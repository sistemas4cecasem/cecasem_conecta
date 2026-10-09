import { ReminderSettingsPage } from '../../features/settings/reminder-settings-page';
import { MeetingsPage, MeetingCreatePage, MeetingDetailPage } from '../../features/meetings/meetings-pages';
import { OpportunitiesPage, OpportunityCreatePage, OpportunityDetailPage } from '../../features/opportunities/opportunities-pages';
import { NotificationsPage } from '../../features/notifications/notifications-page';
import { VerificationSettingsPage } from '../../features/settings/verification-settings-page';
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { HomePage } from '../../features/home/home-page';
import { UnauthenticatedLayout } from '../layout/unauthenticated-layout';
import { NotFoundPage } from './not-found-page';
import { AuthenticatedLayout } from '../layout/authenticated-layout';
import { LoginPage } from '../../features/auth/login-page';
import { ChangePasswordPage } from '../../features/auth/change-password-page';
import { UsersPage } from '../../features/users/users-page';
import { OrganizationsPage, OrganizationCreationPage } from '../../features/directory/organizations-page';
import { OrganizationDetailPage } from '../../features/directory/organization-detail-page';
import { CategoriesPage } from '../../features/directory/categories-page';
import { PeoplePage, PersonCreationPage } from '../../features/directory/people-page';
import { PersonDetailPage } from '../../features/directory/person-detail-page';
import { ContactDetailPage } from '../../features/directory/contact-detail-page';
import { ContactIntentsPage } from '../../features/relationships/contact-intents-page';
import { ContactIntentCreatePage } from '../../features/relationships/contact-intent-create-page';
import { ContactIntentDetailPage } from '../../features/relationships/contact-intent-detail-page';
import { RelationshipProcessesPage } from '../../features/relationships/relationship-processes-page';
import { RelationshipProcessCreatePage } from '../../features/relationships/relationship-process-create-page';
import { RelationshipProcessDetailPage } from '../../features/relationships/relationship-process-detail-page';
import { ContactRestrictionsPage } from '../../features/relationships/contact-restrictions-page';
import { ContactRestrictionCreatePage } from '../../features/relationships/contact-restriction-create-page';
import { ContactRestrictionDetailPage } from '../../features/relationships/contact-restriction-detail-page';
import { SentCommunicationPage } from '../../features/communications/sent-communication-page';
import { ReceivedCommunicationPage } from '../../features/communications/received-communication-page';
import { CommunicationDetailPage } from '../../features/communications/communication-detail-page';
import { ImportsPage } from '../../features/data-exchange/imports-page';
const DirectorySearchPage = lazy(() => import('../../features/directory/search-page'));
const ExportsPage = lazy(() => import('../../features/data-exchange/exports-page').then(module => ({ default: module.ExportsPage })));

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<UnauthenticatedLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<AuthenticatedLayout />}>
        <Route path="change-password" element={<ChangePasswordPage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="meetings/new" element={<MeetingCreatePage />} />
        <Route path="meetings/:id" element={<MeetingDetailPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="opportunities" element={<OpportunitiesPage />} />
        <Route path="opportunities/new" element={<OpportunityCreatePage />} />
        <Route path="opportunities/:id" element={<OpportunityDetailPage />} />
        <Route index element={<HomePage />} />
        <Route path="settings/reminders" element={<ReminderSettingsPage />} />
        <Route path="settings/verification" element={<VerificationSettingsPage />} />
        <Route path="admin/imports" element={<ImportsPage />} />
        <Route path="admin/exports" element={<Suspense fallback={<p role="status">Cargando exportación…</p>}><ExportsPage /></Suspense>} />
        <Route path="users" element={<UsersPage />} />
        <Route path="organizations" element={<OrganizationsPage />} />
        <Route path="directory/search" element={<Suspense fallback={<p role="status">Cargando búsqueda…</p>}><DirectorySearchPage /></Suspense>} />
        <Route path="organizations/new" element={<OrganizationCreationPage />} />
        <Route path="organizations/categories" element={<CategoriesPage />} />
        <Route path="organizations/:id" element={<OrganizationDetailPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="people/new" element={<PersonCreationPage />} />
        <Route path="people/:id" element={<PersonDetailPage />} />
        <Route path="contact-methods/:id" element={<ContactDetailPage />} />
        <Route path="contact-intents" element={<ContactIntentsPage />} />
        <Route path="contact-intents/new" element={<ContactIntentCreatePage />} />
        <Route path="contact-intents/:id" element={<ContactIntentDetailPage />} />
        <Route path="relationship-processes" element={<RelationshipProcessesPage />} />
        <Route path="relationship-processes/new" element={<RelationshipProcessCreatePage />} />
        <Route path="relationship-processes/:id" element={<RelationshipProcessDetailPage />} />
        <Route path="relationship-processes/:id/communications/sent" element={<SentCommunicationPage />} />
        <Route path="relationship-processes/:id/communications/received" element={<ReceivedCommunicationPage />} />
        <Route path="communications/:id" element={<CommunicationDetailPage />} />
        <Route path="contact-restrictions" element={<ContactRestrictionsPage />} />
        <Route path="contact-restrictions/new" element={<ContactRestrictionCreatePage />} />
        <Route path="contact-restrictions/:id" element={<ContactRestrictionDetailPage />} />
      </Route>
    </Routes>
  );
}

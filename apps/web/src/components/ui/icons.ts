import {
  ArrowLeft, ArrowRight, ArrowUpRight, Bell, Building2, CalendarDays, CircleAlert,
  CircleCheck, CircleHelp, ClipboardCheck, ClipboardList, Clock3, Download, Eye, FileDown, FileUp,
  History, Inbox, LayoutDashboard, Lightbulb, ListFilter, LoaderCircle,
  Mail, MailOpen, Paperclip, Pencil, Plus, Save, Search, Send, Settings2, ShieldAlert, ShieldCheck,
  UsersRound, Workflow,
} from 'lucide-react';

/** Iconos semánticos compartidos; el texto de las acciones y estados permanece visible. */
export const iconCatalog = {
  notification: Bell,
  navigation: {
    '/': LayoutDashboard,
    '/organizations': Building2,
    '/people': UsersRound,
    '/contact-intents': ClipboardList,
    '/opportunities': Lightbulb,
    '/meetings': CalendarDays,
    '/relationship-processes': Workflow,
    '/contact-restrictions': ShieldAlert,
    '/settings/reminders': Bell,
    '/settings/verification': Settings2,
    '/admin/imports': FileUp,
    '/admin/exports': FileDown,
    '/users': UsersRound,
  },
  action: { create: Plus, edit: Pencil, view: ArrowUpRight, open: ArrowRight, inspect: Eye, search: Search, filter: ListFilter, export: Download, back: ArrowLeft, history: History, save: Save, attach: Paperclip, sent: Mail, received: MailOpen },
  metric: { process: Workflow, waiting: Clock3, review: ClipboardCheck, preparation: Lightbulb, application: Send, verification: ShieldCheck, meeting: CalendarDays },
  feedback: { neutral: CircleHelp, info: CircleAlert, success: CircleCheck, warning: ShieldAlert, danger: CircleAlert, empty: Inbox, loading: LoaderCircle },
} as const;

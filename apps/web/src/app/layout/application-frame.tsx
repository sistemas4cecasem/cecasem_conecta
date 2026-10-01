import type { ReactNode } from 'react';
import { Link } from 'react-router';

interface ApplicationFrameProps {
  children: ReactNode;
  actions?: ReactNode;
}

export function ApplicationFrame({ children, actions }: ApplicationFrameProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:m-4 focus:p-3">
        Ir al contenido
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-6 py-5 sm:px-10">
          <Link to="/" className="inline-flex min-h-11 items-center text-lg font-semibold tracking-tight">
            CECASEM <span className="ml-1 font-normal text-slate-600">Conecta</span>
          </Link>
          {actions}
        </div>
      </header>
      <main id="contenido" tabIndex={-1} className="mx-auto flex w-full max-w-5xl flex-1 items-center px-6 py-16 sm:px-10 sm:py-24">
        {children}
      </main>
      <footer className="border-t border-slate-200 px-6 py-6 text-center text-sm text-slate-600">
        CECASEM · Relaciones institucionales y cooperación
      </footer>
    </div>
  );
}

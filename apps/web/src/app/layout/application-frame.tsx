import type { ReactNode } from 'react';
import { Link } from 'react-router';
import cecasemLogo from '../../assets/cecasem-logo.png';

interface ApplicationFrameProps {
  children: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
  context?: string;
  pathname?: string;
}

export function ApplicationFrame({ children, actions, navigation, context, pathname }: ApplicationFrameProps) {
  return (
    <div className={navigation ? 'application-shell' : 'access-shell'}>
      <a href="#contenido" className="shell-skip-link">
        Ir al contenido
      </a>
      {navigation && <aside className="shell-sidebar hidden lg:flex" aria-label="Módulos de CECASEM Conecta">
        <Brand />{navigation}
      </aside>}
      <div className="shell-body">
        <header className="shell-topbar">
          {navigation && <div className="shell-mobile-brand lg:hidden"><Brand /></div>}
          <div className="shell-context">
            {navigation ? <><span className="shell-context-label">{context ?? 'CECASEM Conecta'}</span>
              <details key={pathname} className="shell-mobile-menu lg:hidden">
                <summary>Menú principal</summary>
                <div className="shell-mobile-navigation">{navigation}</div>
              </details></> : <Brand />}
          </div>
          {actions && <div className="shell-topbar-actions">{actions}</div>}
        </header>
        <main id="contenido" tabIndex={-1} className={navigation ? 'shell-workspace' : 'access-workspace'}>
          {children}
        </main>
        <footer className="shell-footer">CECASEM · Relaciones institucionales y cooperación</footer>
      </div>
    </div>
  );
}

function Brand() {
  return <Link to="/" className="shell-brand" aria-label="CECASEM Conecta · Inicio">
    <img src={cecasemLogo} className="shell-brand-logo" alt="CECASEM — Centro de Capacitación y Servicio para la Integración de la Mujer" />
    <span className="shell-brand-product">Conecta</span>
  </Link>;
}

import { Link } from 'react-router';
import { iconCatalog } from '../../components/ui/icons';
import { activeNavigationRoute, NAVIGATION_GROUPS, type NavigationItem } from '../router/navigation';

export function ShellNavigation({ items, pathname }: { items: readonly NavigationItem[]; pathname: string }) {
  const activeRoute = activeNavigationRoute(pathname);
  return <nav aria-label="Navegación principal" className="shell-navigation">
    {NAVIGATION_GROUPS.map(group => {
      const links = group.routes.flatMap(route => items.filter(item => item.to === route));
      if (!links.length) return null;
      return <section key={group.label} aria-label={group.label} className="shell-navigation-group"
        data-active={links.some(item => item.to === activeRoute) || undefined}>
        <h2 className="shell-navigation-heading">{group.label}</h2>
        <ul>{links.map(item => {
          const Icon = iconCatalog.navigation[item.to as keyof typeof iconCatalog.navigation];
          return <li key={item.to}>
            <Link to={item.to} className="shell-navigation-link" aria-current={item.to === activeRoute ? 'page' : undefined}>
              {Icon && <Icon className="shell-navigation-icon" size={20} strokeWidth={1.8} aria-hidden="true" />}
              <span>{item.label}</span>
            </Link>
          </li>;
        })}</ul>
      </section>;
    })}
  </nav>;
}

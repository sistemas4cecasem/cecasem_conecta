import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-title" className="ui-detail-page ui-not-found">
      <p className="ui-eyebrow">404</p>
      <h1 id="not-found-title">Página no encontrada</h1>
      <p className="ui-description">Revisa la dirección o vuelve a la página de inicio.</p>
      <Link to="/" className="ui-button ui-button-primary ui-action-medium">
        Volver al inicio
      </Link>
    </section>
  );
}

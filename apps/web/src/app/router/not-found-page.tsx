import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-title">
      <p className="mb-4 text-sm font-medium text-slate-500">404</p>
      <h1 id="not-found-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">Página no encontrada</h1>
      <p className="mt-4 text-slate-600">Revisa la dirección o vuelve a la página de inicio.</p>
      <Link to="/" className="mt-8 inline-flex min-h-11 items-center rounded-md bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-700">
        Volver al inicio
      </Link>
    </section>
  );
}

export function HomePage() {
  return (
    <section className="max-w-3xl" aria-labelledby="home-title">
      <p className="mb-5 text-sm font-semibold tracking-widest text-slate-500">CECASEM</p>
      <h1 id="home-title" className="text-4xl font-semibold tracking-tight sm:text-6xl">CECASEM Conecta</h1>
      <p className="mt-6 max-w-2xl text-xl leading-relaxed text-slate-600 sm:text-2xl">
        Sistema de Gestión de Relaciones Institucionales y Cooperación
      </p>
      <div className="mt-10 border-l-2 border-slate-300 pl-5">
        <h2 className="font-medium">Aplicación base en funcionamiento</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Las funcionalidades se incorporarán progresivamente en las siguientes fases del proyecto.
        </p>
      </div>
    </section>
  );
}

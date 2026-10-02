import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import { relationFormSchema,relationSchema,type PersonRelation,type RelationFormValues } from './contracts';
import { useDirectoryMutation,useOrganizations } from './queries';
import { Field,inputClass,buttonClass,MutationError,Pagination,QueryState } from './directory-ui';
function values(row?:PersonRelation):RelationFormValues {return {organizationId:row?.organizationId??'',positionTitle:row?.positionTitle??'',area:row?.area??'',isCurrent:row?.isCurrent??true,
  startDate:row?.startDate??'',endDate:row?.endDate??'',sourceDescription:row?.sourceDescription??'',sourceUrl:row?.sourceUrl??'',notes:row?.notes??''};}
export function RelationForm({identity,personId,initial,saved,cancel,reload}:{identity:AuthIdentity;personId:string;initial?:PersonRelation;saved:()=>void;cancel:()=>void;reload?:()=>Promise<PersonRelation|undefined>}) {
  const form=useForm<RelationFormValues>({resolver:zodResolver(relationFormSchema),defaultValues:values(initial)});
  const mutation=useDirectoryMutation(identity);const [version,setVersion]=useState(initial?.version);
  const [reloadFailed,setReloadFailed]=useState(false);
  const [name,setName]=useState(''),[page,setPage]=useState(1);
  const organizations=useOrganizations(identity,`organizations?status=all&page=${page}&name=${encodeURIComponent(name)}`);
  async function submit(input:RelationFormValues) {
    const {organizationId,...fields}=input;
    try {relationSchema.parse(await mutation.mutateAsync({path:initial?'person-organization-relations/'+initial.id:'people/'+personId+'/relations',method:initial?'PUT':'POST',
      body:{...fields,startDate:fields.startDate||null,endDate:fields.endDate||null,...(initial?{expectedVersion:version}:{organizationId})}}));saved();} catch { /* Conservar borrador. */ }
  }
  return <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
    <p>{initial?'Corrige datos de este episodio. Si hubo un cambio real de cargo, registra un nuevo episodio para conservar el anterior.':'Este registro es un episodio nuevo. No modifica ni finaliza episodios anteriores.'}</p>
    {initial?<p>Organización: {initial.organization.name}</p>:<fieldset className="space-y-2 rounded border p-3"><legend>Organización del episodio</legend>
      <Field label="Filtrar organizaciones"><input className={inputClass} value={name} onChange={e=>{setName(e.target.value);setPage(1);}}/></Field>
      <QueryState pending={organizations.isPending} error={organizations.isError} retry={organizations.refetch}/>
      {organizations.data?.items.map(org=><label key={org.id} className="flex min-h-11 items-center gap-2"><input type="radio" value={org.id} {...form.register('organizationId')}/><span className="min-w-0 break-words">{org.name}{!org.isActive&&' (inactiva)'}</span></label>)}
      {organizations.data?.total===0&&<p>No hay organizaciones disponibles.</p>}
      {form.formState.errors.organizationId&&<p role="alert">{form.formState.errors.organizationId.message}</p>}
      {organizations.data&&<Pagination page={page} total={organizations.data.total} onPage={setPage}/>}
    </fieldset>}
    <Field label="Cargo (opcional)" error={form.formState.errors.positionTitle?.message}><input className={inputClass} {...form.register('positionTitle')} maxLength={250}/></Field>
    <Field label="Área o función (opcional)" error={form.formState.errors.area?.message}><input className={inputClass} {...form.register('area')} maxLength={250}/></Field>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" {...form.register('isCurrent')}/>Vínculo vigente</label>
    <Field label="Fecha inicial (opcional)" error={form.formState.errors.startDate?.message}><input type="date" className={inputClass} {...form.register('startDate')}/></Field>
    <Field label="Fecha final (opcional)" error={form.formState.errors.endDate?.message}><input type="date" className={inputClass} {...form.register('endDate')}/></Field>
    <p>Deja vacías las fechas desconocidas. Un episodio finalizado puede conservar fecha final desconocida.</p>
    <Field label="Descripción de fuente (opcional)" error={form.formState.errors.sourceDescription?.message}><input className={inputClass} {...form.register('sourceDescription')} maxLength={1000}/></Field>
    <Field label="URL de fuente (opcional)" error={form.formState.errors.sourceUrl?.message}><input className={inputClass} {...form.register('sourceUrl')} maxLength={2048}/></Field>
    <Field label="Observaciones (opcional)" error={form.formState.errors.notes?.message}><textarea className={inputClass} {...form.register('notes')} maxLength={5000}/></Field>
    <MutationError error={mutation.error} reload={reload?async()=>{try{const row=await reload();if(row){form.reset(values(row));setVersion(row.version);mutation.reset();setReloadFailed(false);}}catch{setReloadFailed(true);}}:undefined}/>
    {reloadFailed&&<p role="alert">No se pudo recargar el episodio. El borrador se conserva; puedes intentar recargar nuevamente.</p>}
    <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={mutation.isPending}>{mutation.isPending?'Guardando…':initial?'Guardar corrección':'Registrar episodio'}</button>
      <button type="button" className={buttonClass} onClick={cancel} disabled={mutation.isPending}>Cancelar</button></div>
  </form>;
}

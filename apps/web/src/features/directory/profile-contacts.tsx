import { Surface } from '../../components/ui/layout';
import { dateLabel } from './date-label';
import { contactLabels, type ContactAssociation } from './contacts.contracts';
export function ProfileContacts({contacts,showContext=false}:{contacts:ContactAssociation[];showContext?:boolean}) {
  return <Surface heading="Medios de contacto" className="directory-detail-contacts">
    {!contacts.length?<p>No hay medios de contacto registrados.</p>:<ul className="person-profile-contact-list">{contacts.map(row=>{
      const updatedAt=Date.parse(row.updatedAt)>=Date.parse(row.contactMethod.updatedAt)?row.updatedAt:row.contactMethod.updatedAt;
      return <li key={row.id}>
        <span className="person-profile-contact-type">{contactLabels[row.contactMethod.type]}</span>
        <p className="person-profile-contact-value">{row.contactMethod.value}</p>
        {row.contactMethod.label&&<p>{row.contactMethod.label}</p>}
        {showContext&&row.sourceDescription&&<p>Fuente: {row.sourceDescription}</p>}
        {showContext&&row.sourceUrl&&<p>URL de fuente: {row.sourceUrl}</p>}
        {showContext&&row.notes&&<p>Observaciones: {row.notes}</p>}
        {row.contactMethod.condition==='UNUSABLE'&&<p>Este medio no está disponible.</p>}
        <p className="person-profile-contact-updated">Última actualización: <time dateTime={updatedAt}>{dateLabel(updatedAt)}</time></p>
      </li>;
    })}</ul>}
  </Surface>;
}

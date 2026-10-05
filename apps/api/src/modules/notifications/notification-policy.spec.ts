import { UserRole } from '../../generated/prisma/client';
import { canReceiveMeeting, excludeNotificationActor, materialMeetingChange, meetingNotificationType, opportunityNotificationType, MATERIAL_MEETING_FIELDS } from './notification-policy';

describe('Política P1 de avisos relevantes', () => {
  it.each(['CREATED','DISCARDED','FINISHED'] as const)('clasifica oportunidad %s', kind => {
    expect(opportunityNotificationType(kind)).toBe('OPPORTUNITY_' + kind);
  });
  it.each(['UPDATED','STATUS_CHANGED'] as const)('oportunidad %s no produce avisos menores', kind => expect(opportunityNotificationType(kind)).toBeNull());
  it.each(['CREATED','CANCELLED','COMPLETED'] as const)('clasifica reunión %s', kind => expect(meetingNotificationType(kind,{},null)).toBe('MEETING_' + kind));
  it.each(['ATTENDANCE_RECORDED','AGREEMENT_ADDED'] as const)('%s no produce spam', kind => expect(meetingNotificationType(kind,{},null)).toBeNull());
  it('la incorporación solo avisa a una identidad interna', () => {
    expect(meetingNotificationType('PARTICIPANT_ADDED',{},null)).toBeNull();
    expect(meetingNotificationType('PARTICIPANT_ADDED',{},'usuario')).toBe('MEETING_PARTICIPANT_ADDED');
  });
  it.each(MATERIAL_MEETING_FIELDS)('requiere evidencia anterior/nueva para %s', field => {
    expect(materialMeetingChange({previous:{[field]:'antes'},next:{[field]:'después'}})).toBe(true);
    expect(materialMeetingChange({previous:{[field]:'igual'},next:{[field]:'igual'}})).toBe(false);
    expect(materialMeetingChange({next:{[field]:'después'}})).toBe(false);
    expect(meetingNotificationType('UPDATED',{previous:{[field]:null},next:{[field]:'dato'}},null)).toBe('MEETING_RESCHEDULED');
  });
  it.each([null,[],{}, {previous:{purpose:'antes'},next:{purpose:'después'}},{previous:'texto',next:{timezone:'UTC'}}])('ignora cambios sin evidencia material %j', changes => expect(materialMeetingChange(changes)).toBe(false));
  it.each(Object.values(UserRole))('%s puede recibir si participa y conserva acceso', role => expect(canReceiveMeeting(role,{processId:'proceso',opportunityId:'oportunidad'})).toBe(true));
  it.each(['OPPORTUNITY_DISCARDED','OPPORTUNITY_FINISHED','MEETING_CREATED','MEETING_CANCELLED','MEETING_COMPLETED','MEETING_PARTICIPANT_ADDED','MEETING_RESCHEDULED'] as const)('%s excluye la propia acción', type => expect(excludeNotificationActor(type)).toBe(true));
  it('conserva deliberadamente el autor institucional de P0', () => expect(excludeNotificationActor('OPPORTUNITY_CREATED')).toBe(false));
});

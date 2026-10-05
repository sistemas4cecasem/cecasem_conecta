import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateReminderSettingsDto } from '../settings/reminder-settings.dto';
import { canReceiveReminder, reminderDueAt, reminderType, REMINDER_POLL_MS } from './reminder.rules';

describe('Recordatorios de inactividad', () => {
  it('calcula siete días como 168 horas UTC incluso al cruzar horario estacional', () => {
    expect(reminderDueAt(new Date('2026-03-07T15:00:00Z'),7).toISOString()).toBe('2026-03-14T15:00:00.000Z');
    expect(REMINDER_POLL_MS).toBe(3600000);
  });
  it.each([1,5,14,36500])('acepta intervalo configurable %s', days => {
    expect(+reminderDueAt(new Date(0),days)).toBe(days*86400000);
  });
  it.each([0,-1,1.5,36501,NaN,Infinity])('rechaza intervalo técnico inválido %s', days => {
    expect(() => reminderDueAt(new Date(0),days)).toThrow();
  });
  it.each(['ADMINISTRATOR','BOARD','RESEARCH','PLANNING'])('permite rol %s únicamente dentro de audiencia pertinente', role => {
    expect(canReceiveReminder(role,'intent')).toBe(true); expect(canReceiveReminder(role,'process')).toBe(true);
  });
  it('no admite un rol desconocido',()=>expect(canReceiveReminder('EXTERNAL','process')).toBe(false));
  it('clasifica ambos recursos sin oportunidad/reunión',()=>{
    expect(reminderType('intent')).toBe('INTENT_INACTIVITY_REMINDER'); expect(reminderType('process')).toBe('PROCESS_INACTIVITY_REMINDER');
  });
  it.each([{intervalDays:0,expectedVersion:1},{intervalDays:1.1,expectedVersion:1},{intervalDays:'7',expectedVersion:1},{intervalDays:36501,expectedVersion:1},{intervalDays:7,expectedVersion:0}])('valida configuración %j',async input=>{
    expect(await validate(plainToInstance(UpdateReminderSettingsDto,input))).not.toHaveLength(0);
  });
  it('acepta configuración inicial versionada',async()=>expect(await validate(plainToInstance(UpdateReminderSettingsDto,{intervalDays:7,expectedVersion:1}))).toHaveLength(0));
});

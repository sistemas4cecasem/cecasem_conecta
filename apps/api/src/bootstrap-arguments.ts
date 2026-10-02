import { parseArgs } from 'node:util';

export function bootstrapArguments(args: string[]) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    'given-names': { type: 'string' }, 'family-names': { type: 'string' }, email: { type: 'string' },
  } });
  if (!values['given-names'] || !values['family-names'] || !values.email) throw new Error('Faltan datos de identidad.');
  return { givenNames: values['given-names'], familyNames: values['family-names'], email: values.email };
}

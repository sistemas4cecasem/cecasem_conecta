export interface TranslationEnvironment {
  TRANSLATION_ENABLED: boolean;
  LIBRETRANSLATE_URL: string;
  LIBRETRANSLATE_API_KEY: string;
  TRANSLATION_TIMEOUT_MS: number;
}
/** Configuración opcional: una configuración inválida deshabilita el adapter, nunca el sistema. */
export function translationEnvironment(env: Record<string, unknown>): TranslationEnvironment {
  let url = '';
  try {
    const parsed = new URL(typeof env.LIBRETRANSLATE_URL === 'string' ? env.LIBRETRANSLATE_URL : '');
    if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash) url = parsed.href.replace(/\/+$/, '');
  } catch { /* No hay dependencia de red ni URL obligatoria al iniciar. */ }
  const configuredTimeout = env.TRANSLATION_TIMEOUT_MS ?? '10000';
  const rawTimeout = typeof configuredTimeout === 'string' || typeof configuredTimeout === 'number' ? String(configuredTimeout) : '';
  const timeout = /^\d+$/.test(rawTimeout) ? Number(rawTimeout) : NaN;
  const validTimeout = Number.isInteger(timeout) && timeout >= 100 && timeout <= 60000;
  return {
    TRANSLATION_ENABLED: (env.TRANSLATION_ENABLED === true || env.TRANSLATION_ENABLED === 'true') && !!url && validTimeout,
    LIBRETRANSLATE_URL: url,
    LIBRETRANSLATE_API_KEY: typeof env.LIBRETRANSLATE_API_KEY === 'string' ? env.LIBRETRANSLATE_API_KEY : '',
    TRANSLATION_TIMEOUT_MS: validTimeout ? timeout : 10000,
  };
}

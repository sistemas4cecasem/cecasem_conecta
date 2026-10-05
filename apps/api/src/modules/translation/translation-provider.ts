export interface TranslationInput { text: string; sourceLanguage: 'auto'; targetLanguage: 'es' }
export interface TranslationResult { translatedText: string; detectedSourceLanguage?: string }
export abstract class TranslationProvider {
  abstract readonly name: string;
  abstract translate(input: TranslationInput): Promise<TranslationResult>;
}
export class TranslationError extends Error {
  constructor(public readonly code: 'TRANSLATION_UNAVAILABLE' | 'TRANSLATION_TIMEOUT' | 'TRANSLATION_PROVIDER_ERROR' | 'TRANSLATION_EMPTY_BODY') { super(code); }
}

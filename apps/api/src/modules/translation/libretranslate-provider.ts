import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../../config/environment';
import { TranslationProvider, TranslationError, type TranslationInput, type TranslationResult } from './translation-provider';

// El dominio admite 200000 caracteres; la respuesta JSON puede escapar/expandir ese texto.
export const TRANSLATION_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;
@Injectable()
export class LibreTranslateProvider extends TranslationProvider {
  readonly name = 'LibreTranslate';
  constructor(private readonly config: ConfigService<AppEnvironment, true>) { super(); }
  async translate(input: TranslationInput): Promise<TranslationResult> {
    if (!input.text.trim()) throw new TranslationError('TRANSLATION_EMPTY_BODY');
    if (!this.config.get('TRANSLATION_ENABLED', { infer: true })) throw new TranslationError('TRANSLATION_UNAVAILABLE');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.get('TRANSLATION_TIMEOUT_MS', { infer: true }));
    try {
      const key = this.config.get('LIBRETRANSLATE_API_KEY', { infer: true });
      const response = await fetch(this.config.get('LIBRETRANSLATE_URL', { infer: true }) + '/translate', {
        method: 'POST', redirect: 'error', signal: controller.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ q: input.text, source: input.sourceLanguage, target: input.targetLanguage, format: 'text', ...(key ? { api_key: key } : {}) }),
      });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new TranslationError('TRANSLATION_PROVIDER_ERROR'); }
      const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > TRANSLATION_RESPONSE_MAX_BYTES) { await reader.cancel(); throw new TranslationError('TRANSLATION_PROVIDER_ERROR'); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!value || typeof value !== 'object' || !('translatedText' in value) || typeof value.translatedText !== 'string' || !value.translatedText.trim() || value.translatedText.includes('\0')) throw new TranslationError('TRANSLATION_PROVIDER_ERROR');
      let detectedSourceLanguage: string | undefined;
      if ('detectedLanguage' in value && value.detectedLanguage && typeof value.detectedLanguage === 'object' && 'language' in value.detectedLanguage && typeof value.detectedLanguage.language === 'string' && /^[a-z]{2,3}(?:-[A-Za-z]{2,8})?$/.test(value.detectedLanguage.language)) detectedSourceLanguage = value.detectedLanguage.language;
      return { translatedText: value.translatedText, detectedSourceLanguage };
    } catch (error) {
      if (controller.signal.aborted) throw new TranslationError('TRANSLATION_TIMEOUT');
      if (error instanceof TranslationError) throw error;
      throw new TranslationError('TRANSLATION_PROVIDER_ERROR');
    } finally { clearTimeout(timer); }
  }
}

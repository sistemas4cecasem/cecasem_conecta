/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

function tokenColor(name: string): string {
  const match = stylesheet.match(new RegExp(`--color-${name}:\\s*(#[\\da-f]{6})`, 'i'));
  if (!match?.[1]) throw new Error(`Falta el color ${name}`);
  return match[1];
}

function luminance(color: string): number {
  function channelAt(offset: number): number {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }
  return channelAt(1) * 0.2126 + channelAt(3) * 0.7152 + channelAt(5) * 0.0722;
}

describe('Contraste del texto secundario institucional', () => {
  it.each([
    ['fondo institucional', 'app-background'],
    ['superficie blanca', 'app-surface'],
    ['superficie de apoyo', 'brand-soft'],
  ])('mantiene margen sobre 4,5:1 en %s', (_label, background) => {
    const values = [luminance(tokenColor('app-muted')), luminance(tokenColor(background))];
    const contrast = (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
    expect(contrast).toBeGreaterThanOrEqual(4.6);
  });
});

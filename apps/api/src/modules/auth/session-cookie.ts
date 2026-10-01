import { parseCookie } from 'cookie';
import { CookieOptions, Request } from 'express';

export const SESSION_COOKIE_NAME = 'cecasem_session';
export function sessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/api/v1' };
}
export function readSessionToken(request: Pick<Request, 'headers'>): string | undefined {
  return parseCookie(request.headers.cookie ?? '')[SESSION_COOKIE_NAME];
}

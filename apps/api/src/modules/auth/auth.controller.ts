import { BadRequestException, Body, ConflictException, Controller, Get, Header, HttpCode, Post, Req, Res, UnauthorizedException, UnsupportedMediaTypeException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiNoContentResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppEnvironment } from '../../config/environment';
import { AuthService, InvalidCredentialsError } from './auth.service';
import { AuthenticatedUserDto, LoginDto } from './auth.dto';
import { SESSION_COOKIE_NAME, readSessionToken, sessionCookieOptions } from './session-cookie';
import { CurrentUser, SessionGuard } from './session.guard';
import { SessionsService } from './sessions.service';
import { InvalidNewPasswordError } from './password.service';
import { ReusedPasswordError } from './password-reset.errors';
import { AllowForcedPasswordChange } from './forced-password-change.decorator';
import { ChangePasswordDto } from './change-password.dto';
import { RequiredPasswordChangeService, RequiredPasswordChangeUnavailableError } from './required-password-change.service';

function requireJson(request: Request): void {
  if (!request.is('application/json')) throw new UnsupportedMediaTypeException('Se requiere application/json.');
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly sessions: SessionsService,
    private readonly config: ConfigService<AppEnvironment, true>, private readonly requiredPasswordChange: RequiredPasswordChangeService) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AuthenticatedUserDto })
  @ApiUnauthorizedResponse({ description: 'Credenciales no válidas.' })
  async login(@Body() input: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<AuthenticatedUserDto> {
    requireJson(request);
    try {
      const result = await this.auth.login(input.email, input.password, readSessionToken(request));
      response.cookie(SESSION_COOKIE_NAME, result.token, {
        ...sessionCookieOptions(this.config.get('SESSION_COOKIE_SECURE', { infer: true })),
        maxAge: this.config.get('SESSION_TTL_SECONDS', { infer: true }) * 1000,
      });
      return result.user;
    } catch (error) {
      if (error instanceof InvalidCredentialsError) throw new UnauthorizedException('Credenciales no válidas.');
      throw error;
    }
  }

  @Post('change-password')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  @AllowForcedPasswordChange()
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth('cecasem_session')
  @ApiNoContentResponse()
  async changeRequiredPassword(@Body() input: ChangePasswordDto, @CurrentUser() user: AuthenticatedUserDto,
    @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    requireJson(request);
    try {
      const token = await this.requiredPasswordChange.change(user.id, input.password);
      response.cookie(SESSION_COOKIE_NAME, token, {
        ...sessionCookieOptions(this.config.get('SESSION_COOKIE_SECURE', { infer: true })),
        maxAge: this.config.get('SESSION_TTL_SECONDS', { infer: true }) * 1000,
      });
    } catch (error) {
      if (error instanceof InvalidNewPasswordError || error instanceof ReusedPasswordError) throw new BadRequestException(error.message);
      if (error instanceof RequiredPasswordChangeUnavailableError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiNoContentResponse()
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    requireJson(request);
    await this.sessions.revoke(readSessionToken(request));
    response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions(this.config.get('SESSION_COOKIE_SECURE', { infer: true })));
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @AllowForcedPasswordChange()
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth('cecasem_session')
  @ApiOkResponse({ type: AuthenticatedUserDto })
  @ApiUnauthorizedResponse()
  me(@CurrentUser() user: AuthenticatedUserDto): AuthenticatedUserDto { return user; }
}

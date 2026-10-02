import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, HttpCode, NotFoundException, Post, Req, Res, UnauthorizedException, UnsupportedMediaTypeException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNoContentResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppEnvironment } from '../../config/environment';
import { AuthService, InvalidCredentialsError } from './auth.service';
import { AuthenticatedUserDto, LoginDto } from './auth.dto';
import { SESSION_COOKIE_NAME, readSessionToken, sessionCookieOptions } from './session-cookie';
import { CurrentUser, SessionGuard } from './session.guard';
import { SessionsService } from './sessions.service';
import { FirstAccessService } from './first-access.service';
import { ConsumeFirstAccessDto, IssuedFirstAccessDto, IssueFirstAccessDto } from './first-access.dto';
import { FirstAccessEmissionError, FirstAccessSessionConflictError, InvalidFirstAccessError } from './first-access.errors';
import { InvalidNewPasswordError } from './password.service';

function requireJson(request: Request): void {
  if (!request.is('application/json')) throw new UnsupportedMediaTypeException('Se requiere application/json.');
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly sessions: SessionsService,
    private readonly config: ConfigService<AppEnvironment, true>, private readonly firstAccess: FirstAccessService) {}

  @Post('first-access-tokens')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth('cecasem_session')
  @ApiCreatedResponse({ type: IssuedFirstAccessDto })
  @ApiForbiddenResponse()
  @ApiUnauthorizedResponse()
  async issueFirstAccess(@Body() input: IssueFirstAccessDto, @CurrentUser() actor: AuthenticatedUserDto,
    @Req() request: Request): Promise<IssuedFirstAccessDto> {
    requireJson(request);
    try { return await this.firstAccess.issue(input.userId, actor); }
    catch (error) {
      if (error instanceof FirstAccessEmissionError) {
        if (error.reason === 'FORBIDDEN') throw new ForbiddenException('Solo un Administrador puede emitir primer acceso.');
        if (error.reason === 'NOT_FOUND') throw new NotFoundException('No se encontró el usuario destinatario.');
        throw new ConflictException(error.reason === 'INACTIVE' ? 'El usuario está inactivo.' : 'El usuario ya estableció su contraseña.');
      }
      throw error;
    }
  }

  @Post('first-access')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Credencial temporal no válida o contraseña fuera de la política.' })
  @ApiConflictResponse({ description: 'Debe cerrar la sesión abierta.' })
  async consumeFirstAccess(@Body() input: ConsumeFirstAccessDto, @Req() request: Request): Promise<void> {
    requireJson(request);
    try { await this.firstAccess.consume(input.token, input.password, readSessionToken(request)); }
    catch (error) {
      if (error instanceof InvalidFirstAccessError || error instanceof InvalidNewPasswordError) throw new BadRequestException(error.message);
      if (error instanceof FirstAccessSessionConflictError) throw new ConflictException(error.message);
      throw error;
    }
  }

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
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth('cecasem_session')
  @ApiOkResponse({ type: AuthenticatedUserDto })
  @ApiUnauthorizedResponse()
  me(@CurrentUser() user: AuthenticatedUserDto): AuthenticatedUserDto { return user; }
}

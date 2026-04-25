import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  UsePipes,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GoogleOauthStartGuard } from './guards/google-oauth-start.guard';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiBody,
  ApiResponse,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RegisterSchema, type RegisterDto } from './dto/register.dto';
import { APP_CONFIG } from '../config/config.constants';
import type { AppConfig } from '../config/app-config.types';
import {
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from './refresh-cookie';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    @Inject(APP_CONFIG) private appConfig: AppConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // Email / password
  // ---------------------------------------------------------------------------

  @Public()
  @Post('register')
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  @ApiOperation({ summary: 'Register with email + password' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'user@example.com' },
        password: {
          type: 'string',
          minLength: 8,
          example: 'Secret123',
          description: 'At least 8 characters, one uppercase letter, one number',
        },
        name: { type: 'string', maxLength: 100, example: 'Jane Doe' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'User created — returns access token + user; refresh token is set as httpOnly cookie',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        apiKey: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string' },
            name: { type: 'string', nullable: true },
            avatarUrl: { type: 'string', nullable: true },
            role: { type: 'string', example: 'USER' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { refreshToken, ...body } = await this.authService.register(dto);
    setRefreshTokenCookie(res, refreshToken, this.appConfig);
    return body;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('local'))
  @ApiOperation({
    summary: 'Login with email + password',
    description:
      'Returns access token + user in JSON; refresh token is set as an httpOnly cookie.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'user@example.com' },
        password: { type: 'string', example: 'Secret123' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string' },
            name: { type: 'string', nullable: true },
            avatarUrl: { type: 'string', nullable: true },
            role: { type: 'string', example: 'USER' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  async login(
    @Req() req: { user: any },
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { refreshToken, ...body } = await this.authService.login(req.user);
    setRefreshTokenCookie(res, refreshToken, this.appConfig);
    return body;
  }

  // ---------------------------------------------------------------------------
  // Token management
  // ---------------------------------------------------------------------------

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt-refresh'))
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: 'Rotate refresh token and issue a new access token',
    description:
      'Sends the refresh token httpOnly cookie set at login/register/OAuth; returns a new access token and rotates the refresh cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'New access token; new refresh token in httpOnly cookie',
    schema: {
      properties: {
        accessToken: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Req() req: { user: { id: string; tokenId: string } },
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { refreshToken, ...body } = await this.authService.refreshTokens(
      req.user.id,
      req.user.tokenId,
    );
    setRefreshTokenCookie(res, refreshToken, this.appConfig);
    return body;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt-refresh'))
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: 'Revoke the current refresh token',
    description: 'Uses the refresh httpOnly cookie; clears the cookie on success.',
  })
  @ApiResponse({ status: 204, description: 'Refresh token revoked' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async logout(
    @Req() req: { user: { tokenId: string } },
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.authService.logout(req.user.tokenId);
    clearRefreshTokenCookie(res, this.appConfig);
  }

  // ---------------------------------------------------------------------------
  // GitHub OAuth — browser-only redirects, excluded from Swagger UI
  // ---------------------------------------------------------------------------

  @Public()
  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiExcludeEndpoint()
  githubAuth() {
    // Passport redirects; this body never executes
  }

  @Public()
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiExcludeEndpoint()
  async githubCallback(@Req() req: any, @Res() res: FastifyReply) {
    const tokens = await this.authService.oauthLogin(req.user);
    const frontendUrl = this.appConfig.frontend.url;
    setRefreshTokenCookie(res, tokens.refreshToken, this.appConfig);
    const hash = `accessToken=${encodeURIComponent(tokens.accessToken)}`;
    // Return the reply so Fastify (and @Res()) end the request cleanly; omitting
    // return can leave a blank page or a stuck document load.
    return res.redirect(
      `${frontendUrl}/auth/callback#${hash}`,
      302,
    );
  }

  // ---------------------------------------------------------------------------
  // Google OAuth — browser-only redirects, excluded from Swagger UI
  // ---------------------------------------------------------------------------

  @Public()
  @Get('google')
  /** `prompt=select_account` is only for the Google authorize URL; callback uses `AuthGuard('google')` only. */
  @UseGuards(GoogleOauthStartGuard)
  @ApiExcludeEndpoint()
  googleAuth() {}

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiExcludeEndpoint()
  async googleCallback(@Req() req: any, @Res() res: FastifyReply) {
    const tokens = await this.authService.oauthLogin(req.user);
    const frontendUrl = this.appConfig.frontend.url;
    setRefreshTokenCookie(res, tokens.refreshToken, this.appConfig);
    const hash = `accessToken=${encodeURIComponent(tokens.accessToken)}`;
    // Return the reply so Fastify (and @Res()) end the request cleanly; omitting
    // return can leave a blank page or a stuck document load.
    return res.redirect(
      `${frontendUrl}/auth/callback#${hash}`,
      302,
    );
  }

  // ---------------------------------------------------------------------------
  // Convenience: who am I?
  // ---------------------------------------------------------------------------

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the currently authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Authenticated user profile',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string' },
        name: { type: 'string', nullable: true },
        avatarUrl: { type: 'string', nullable: true },
        role: { type: 'string', example: 'USER' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  me(@CurrentUser() user: any) {
    const { hashedPassword, apiKeyHash, ...safe } = user;
    return safe;
  }
}

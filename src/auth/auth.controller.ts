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
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
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
import { GithubOnboardingService } from '../github/github-onboarding.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly onboarding: GithubOnboardingService,
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
  @UseGuards(JwtRefreshAuthGuard)
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
  @UseGuards(JwtRefreshAuthGuard)
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
  @Get('github/install')
  @ApiOperation({ summary: 'GitHub App installation URL for connecting repositories' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['installUrl'],
      properties: {
        installUrl: { type: 'string', example: 'https://github.com/apps/codelens/installations/new' },
      },
    },
  })
  githubInstallUrl() {
    return { installUrl: this.appConfig.githubApp.appInstallUrl };
  }

  @Public()
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback', description: 'Redirect after GitHub OAuth login. Sets cookies and redirects to the frontend. Not meant for Swagger UI use.' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend with tokens, sets cookies.' })
  @ApiExcludeEndpoint()
  async githubCallback(
    @Req() req: { user: { id: string } },
    @Res() res: FastifyReply,
  ) {
    const tokens = await this.authService.oauthLogin(req.user);
    const frontendUrl = this.appConfig.frontend.url;
    setRefreshTokenCookie(res, tokens.refreshToken, this.appConfig);
    const hash = `accessToken=${encodeURIComponent(tokens.accessToken)}`;
    return res.redirect(`${frontendUrl}/auth/callback#${hash}`, 302);
  }

  @Post('github/installations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Onboard a GitHub App installation for the current user' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['installationId'],
      properties: {
        installationId: { type: 'number', example: 135116734 },
      },
    },
  })
  @ApiResponse({ status: 204, description: 'Installation linked and repositories seeded.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  async onboardInstallation(
    @CurrentUser() user: { id: string },
    @Body() body: { installationId: number },
  ) {
    await this.onboarding.onboardInstallation(body.installationId, user.id);
  }

  // ---------------------------------------------------------------------------
  // Google OAuth — browser-only redirects, excluded from Swagger UI
  // ---------------------------------------------------------------------------

  @Public()
  @Get('google')
  /** `prompt=select_account` is only for the Google authorize URL; callback uses `AuthGuard('google')` only. */
  @UseGuards(GoogleOauthStartGuard)
  @ApiOperation({ summary: 'Google OAuth redirect', description: 'Redirects to Google for OAuth login.' })
  @ApiResponse({ status: 302, description: 'Redirects to Google for OAuth.' })
  @ApiExcludeEndpoint()
  googleAuth() {}

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback', description: 'Redirect after Google OAuth provider login. Sets cookies and redirects to the frontend. Not meant for Swagger UI use.' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend with tokens, sets cookies.' })
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

}

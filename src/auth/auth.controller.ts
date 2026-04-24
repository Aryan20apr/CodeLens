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
  } from '@nestjs/common';
  import { AuthGuard } from '@nestjs/passport';
  import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
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
  import { LoginSchema, type LoginDto } from './dto/login.dto';
  import { ConfigService } from '@nestjs/config';
  import type { AppConfig } from '../config/app-config.types';
  
  @ApiTags('Auth')
  @Controller('auth')
  export class AuthController {
    constructor(
      private authService: AuthService,
      private config: ConfigService<AppConfig, true>,
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
    description: 'User created — returns access + refresh token pair',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
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
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('local'))
  @ApiOperation({ summary: 'Login with email + password — returns JWT pair' })
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
    description: 'Login successful — returns access + refresh token pair',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
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
  async login(@Req() req: any) {
    return this.authService.login(req.user);
  }

  // ---------------------------------------------------------------------------
  // Token management
  // ---------------------------------------------------------------------------

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt-refresh'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Exchange refresh token for a new token pair',
    description:
      'Pass the refresh token as a Bearer token in the Authorization header.',
  })
  @ApiResponse({
    status: 200,
    description: 'New access + refresh token pair issued',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Req() req: any) {
    return this.authService.refreshTokens(req.user.id, req.user.tokenId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt-refresh'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke the supplied refresh token',
    description:
      'Pass the refresh token as a Bearer token in the Authorization header.',
  })
  @ApiResponse({ status: 204, description: 'Refresh token revoked' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async logout(@Req() req: any) {
    await this.authService.logout(req.user.tokenId);
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
    const frontendUrl = this.config.get('frontend.url', { infer: true });
    const params = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
  }

  // ---------------------------------------------------------------------------
  // Google OAuth — browser-only redirects, excluded from Swagger UI
  // ---------------------------------------------------------------------------

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiExcludeEndpoint()
  googleAuth() {}

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiExcludeEndpoint()
  async googleCallback(@Req() req: any, @Res() res: FastifyReply) {
    const tokens = await this.authService.oauthLogin(req.user);
    const frontendUrl = this.config.get('frontend.url', { infer: true });
    const params = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
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
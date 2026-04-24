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
  import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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
    async register(@Body() dto: RegisterDto) {
      return this.authService.register(dto);
    }
  
    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @UseGuards(AuthGuard('local'))
    @ApiOperation({ summary: 'Login with email + password, returns JWT pair' })
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
    @ApiOperation({ summary: 'Exchange refresh token for new token pair' })
    async refresh(@Req() req: any) {
      return this.authService.refreshTokens(req.user.id, req.user.tokenId);
    }
  
    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(AuthGuard('jwt-refresh'))
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Revoke the supplied refresh token' })
    async logout(@Req() req: any) {
      await this.authService.logout(req.user.tokenId);
    }
  
    // ---------------------------------------------------------------------------
    // GitHub OAuth
    // ---------------------------------------------------------------------------
  
    @Public()
    @Get('github')
    @UseGuards(AuthGuard('github'))
    @ApiOperation({ summary: 'Initiate GitHub OAuth flow' })
    githubAuth() {
      // Passport redirects; this body never executes
    }
  
    @Public()
    @Get('github/callback')
    @UseGuards(AuthGuard('github'))
    @ApiOperation({ summary: 'GitHub OAuth callback' })
    async githubCallback(@Req() req: any, @Res() res: FastifyReply) {
      const tokens = await this.authService.oauthLogin(req.user);
      const frontendUrl = this.config.get('frontend.url', { infer: true });
      // Pass tokens to frontend via redirect query params (or use a short-lived code)
      const params = new URLSearchParams({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
    }
  
    // ---------------------------------------------------------------------------
    // Google OAuth
    // ---------------------------------------------------------------------------
  
    @Public()
    @Get('google')
    @UseGuards(AuthGuard('google'))
    @ApiOperation({ summary: 'Initiate Google OAuth flow' })
    googleAuth() {}
  
    @Public()
    @Get('google/callback')
    @UseGuards(AuthGuard('google'))
    @ApiOperation({ summary: 'Google OAuth callback' })
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
    @ApiOperation({ summary: 'Return currently authenticated user' })
    me(@CurrentUser() user: any) {
      const { hashedPassword, apiKeyHash, ...safe } = user;
      return safe;
    }
  }
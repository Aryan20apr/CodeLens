import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/refresh.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { GoogleOauthStartGuard } from './guards/google-oauth-start.guard';
import { GoogleStrategy } from './strategies/google.strategy';
import { ApiKeyStrategy } from './strategies/api-key.strategy';
import { UserModule } from '../user/user.module';
import { PrismaModule } from '../db/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    PassportModule,
    // JwtModule is registered without a secret here because each signAsync
    // call passes its own secret. The module is needed for injection.
    JwtModule.register({}),
    UserModule,
    PrismaModule,
    ConfigModule
  ],
  controllers: [AuthController],
  providers: [
    GoogleOauthStartGuard,
    AuthService,
    LocalStrategy,
    JwtStrategy,
    JwtRefreshStrategy,
    GithubStrategy,
    GoogleStrategy,
    ApiKeyStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
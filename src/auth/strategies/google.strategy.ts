import { Injectable, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';
import { APP_CONFIG } from '../../config/config.constants';
import type { AppConfig } from '../../config/app-config.types';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private authService: AuthService,
  ) {
    super({
      clientID: config.oauth.google.clientId,
      clientSecret: config.oauth.google.clientSecret,
      callbackURL: config.oauth.google.callbackUrl,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string | undefined,
    profile: Profile,
    done: VerifyCallback,
  ) {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error('No email from Google'), undefined);

      const user = await this.authService.findOrCreateOAuthUser({
        provider: 'GOOGLE',
        providerUid: profile.id,
        email,
        name: profile.displayName ?? null,
        avatarUrl: profile.photos?.[0]?.value ?? null,
        accessToken,
        refreshToken: refreshToken ?? null,
      });

      done(null, user);
    } catch (err) {
      done(err as Error, undefined);
    }
  }
}
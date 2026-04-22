import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import type { AppConfig } from '../../config/app-config.types';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    config: ConfigService<AppConfig, true>,
    private authService: AuthService,
  ) {
    super({
      clientID: config.get('oauth.github.clientId', { infer: true }),
      clientSecret: config.get('oauth.github.clientSecret', { infer: true }),
      callbackURL: config.get('oauth.github.callbackUrl', { infer: true }),
      scope: ['user:email', 'read:user', 'repo'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string | undefined,
    profile: Profile,
    done: (err: any, user: any) => void,
  ) {
    try {
      const email =
        profile.emails?.[0]?.value ??
        `${profile.username}@github-noemail.local`;

      const user = await this.authService.findOrCreateOAuthUser({
        provider: 'GITHUB',
        providerUid: profile.id,
        email,
        name: profile.displayName ?? profile.username ?? null,
        avatarUrl: profile.photos?.[0]?.value ?? null,
        accessToken,
        refreshToken: refreshToken ?? null,
      });

      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }
}
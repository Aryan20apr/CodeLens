import { Injectable, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { AuthService } from '../auth.service';
import { APP_CONFIG } from '../../config/config.constants';
import type { AppConfig } from '../../config/app-config.types';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private authService: AuthService,
  ) {
    super({
      clientID: config.oauth.github.clientId,
      clientSecret: config.oauth.github.clientSecret,
      callbackURL: config.oauth.github.callbackUrl,
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
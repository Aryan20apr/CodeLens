import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';
import type { AppConfig } from '../../config/app-config.types';

export interface JwtPayload {
  sub: string;   // user.id
  email: string;
  role: string;
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<AppConfig, true>,
    private userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('auth.jwtAccessSecret', { infer: true }),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type !== 'access') throw new UnauthorizedException();
    const user = await this.userService.findById(payload.sub);
    if (!user) throw new UnauthorizedException('User no longer exists');
    return user;
  }
}
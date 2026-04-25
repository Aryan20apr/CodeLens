import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard, IAuthModuleOptions } from '@nestjs/passport';

/**
 * Redirect to Google with `prompt=select_account` so the account picker is always shown
 */
@Injectable()
export class GoogleOauthStartGuard extends AuthGuard('google') {
  getAuthenticateOptions(
    _context: ExecutionContext,
  ): IAuthModuleOptions | undefined {
    return { prompt: 'select_account' };
  }
}

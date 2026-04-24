import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '..//common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  getMe(@CurrentUser() user: any) {
    const { hashedPassword, apiKeyHash, ...safe } = user;
    return safe;
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: any,
    @Body() body: { name?: string },
  ) {
    return this.userService.updateProfile(user.id, body);
  }

  @Post('me/api-key')
  async regenerateApiKey(@CurrentUser() user: any) {
    const rawKey = await this.userService.regenerateApiKey(user.id);
    return {
      apiKey: rawKey,
      message: 'Store this key securely — it will not be shown again.',
    };
  }
}
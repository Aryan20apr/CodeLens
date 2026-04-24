import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '..//common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Current user profile',
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
  getMe(@CurrentUser() user: any) {
    const { hashedPassword, apiKeyHash, ...safe } = user;
    return safe;
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 100, example: 'Jane Doe' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Updated user profile' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  updateMe(
    @CurrentUser() user: any,
    @Body() body: { name?: string },
  ) {
    return this.userService.updateProfile(user.id, body);
  }

  @Post('me/api-key')
  @ApiOperation({
    summary: 'Regenerate API key',
    description: 'Issues a new API key and invalidates the previous one. The raw key is only returned once — store it securely.',
  })
  @ApiResponse({
    status: 201,
    description: 'New API key generated',
    schema: {
      properties: {
        apiKey: { type: 'string', example: 'cl_live_xxxxxxxxxxxxxxxx' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async regenerateApiKey(@CurrentUser() user: any) {
    const rawKey = await this.userService.regenerateApiKey(user.id);
    return {
      apiKey: rawKey,
      message: 'Store this key securely — it will not be shown again.',
    };
  }
}
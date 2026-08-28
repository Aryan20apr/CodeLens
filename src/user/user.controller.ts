import { Controller, Get, Patch, Post, Body, UseGuards, UsePipes } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { zodToOpenApi } from '../common/utils/zod-to-openapi.util';
import { UpdateProfileDto, UpdateProfileSchema } from './dto/update-user.dto';
import { apiEnvelopeSchema } from '../common/utils/swagger.util';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';

const UserProfileSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string' },
    name: { type: 'string', nullable: true },
    avatarUrl: { type: 'string', nullable: true },
    role: { type: 'string', example: 'USER' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

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
    schema: apiEnvelopeSchema(UserProfileSchema, {
      message: 'User profile retrieved successfully',
    }),
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  getMe(@CurrentUser() user: any) {
    const {
      hashedPassword,
      apiKeyHash,
      oauthAccounts,
      refreshTokens,
      githubInstallations,
      prReviews,
      preferences,
      ...safe
    } = user;
    return {
      success: true,
      message: 'User profile retrieved successfully',
      data: safe,
    };
  }

  @Patch('me')
  @UsePipes(new ZodValidationPipe(UpdateProfileSchema))
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiBody({ schema: zodToOpenApi(UpdateProfileSchema) })
  @ApiResponse({
    status: 200,
    description: 'Updated user profile',
    schema: apiEnvelopeSchema(UserProfileSchema, {
      message: 'User profile updated successfully',
    }),
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async updateMe(
    @CurrentUser() user: any,
    @Body() body: UpdateProfileDto,
  ) {
    const updated = await this.userService.updateProfile(user.id, body);
    return {
      success: true,
      message: 'User profile updated successfully',
      data: updated,
    };
  }

  @Post('me/api-key')
  @ApiOperation({
    summary: 'Regenerate API key',
    description: 'Issues a new API key and invalidates the previous one. The raw key is only returned once — store it securely.',
  })
  @ApiResponse({
    status: 201,
    description: 'New API key generated',
    schema: apiEnvelopeSchema(
      {
        type: 'object',
        properties: {
          apiKey: { type: 'string', example: 'cl_live_xxxxxxxxxxxxxxxx' },
        },
      },
      {
        message:
          'New API key generated successfully. Store this key securely — it will not be shown again.',
      },
    ),
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async regenerateApiKey(@CurrentUser() user: any) {
    const rawKey = await this.userService.regenerateApiKey(user.id);
    return {
      success: true,
      message: 'New API key generated successfully. Store this key securely — it will not be shown again.',
      data: {
        apiKey: rawKey,
      },
    };
  }
}
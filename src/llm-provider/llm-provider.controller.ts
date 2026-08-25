import { Controller, Get, Put, Delete, Body, Param, UseGuards, ParseEnumPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LlmProviderService } from './llm-provider.service';
import { SaveProviderKeyDto, SaveProviderKeySchema } from './dto/save-provider-key.dto';
import { SetActiveProviderDto, SetActiveProviderSchema } from './dto/set-active-provider.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { zodToOpenApi } from '../common/utils/zod-to-openapi.util';
import { LlmProvider } from '../../generated/prisma/client';
import { apiEnvelopeSchema, apiArrayEnvelopeSchema } from '../common/utils/swagger.util';

@ApiTags('LLM Provider (BYOK)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('llm-provider')
export class LlmProviderController {
  constructor(
    private readonly llmProviderService: LlmProviderService,
  ) { }

  @Get('keys')
  @ApiOperation({ summary: 'List saved LLM provider keys' })
  @ApiResponse({
    status: 200,
    description: 'List of saved providers with masked keys',
    schema: apiArrayEnvelopeSchema(
      {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: Object.values(LlmProvider) },
          maskedKey: { type: 'string', example: 'sk-...1234' },
          updatedAt: { type: 'string', format: 'date-time' },
          baseUrl: { type: 'string', nullable: true, example: 'https://api.groq.com/openai/v1' },
        },
      },
      { message: 'Stored LLM provider keys retrieved successfully' },
    ),
  })
  async getStoredKeys(@CurrentUser() user: any) {
    const keys = await this.llmProviderService.getStoredKeys(user.id);
    return {
      success: true,
      message: 'Stored LLM provider keys retrieved successfully',
      data: keys,
    };
  }

  @Put('keys/:provider')
  @ApiOperation({ summary: 'Save or update an API key for a provider' })
  @ApiParam({ name: 'provider', enum: LlmProvider })
  @ApiBody({ schema: zodToOpenApi(SaveProviderKeySchema) })
  @ApiResponse({
    status: 200,
    description: 'Key saved successfully, returns available models',
    schema: apiEnvelopeSchema(
      {
        type: 'object',
        properties: {
          maskedKey: { type: 'string', example: 'sk-...1234' },
          models: {
            type: 'array',
            items: { type: 'string' },
            example: ['gemini-2.0-flash', 'gemini-1.5-pro'],
          },
        },
      },
      { message: 'API key for GEMINI saved successfully' },
    ),
  })
  @ApiResponse({ status: 401, description: 'Invalid API key' })
  async saveKey(
    @CurrentUser() user: any,
    @Param('provider', new ParseEnumPipe(LlmProvider)) provider: LlmProvider,
    @Body(new ZodValidationPipe(SaveProviderKeySchema)) dto: SaveProviderKeyDto,
  ) {
    const result = await this.llmProviderService.saveKey(user.id, provider, dto.apiKey, dto.baseUrl);
    return {
      success: true,
      message: `API key for ${provider} saved successfully`,
      data: result,
    };
  }

  @Delete('keys/:provider')
  @ApiOperation({ summary: 'Delete a saved API key' })
  @ApiParam({ name: 'provider', enum: LlmProvider })
  @ApiResponse({
    status: 200,
    description: 'Key deleted',
    schema: apiEnvelopeSchema(null, { message: 'API key for GEMINI deleted successfully' }),
  })
  async deleteKey(
    @CurrentUser() user: any,
    @Param('provider', new ParseEnumPipe(LlmProvider)) provider: LlmProvider,
  ) {
    await this.llmProviderService.deleteKey(user.id, provider);
    return {
      success: true,
      message: `API key for ${provider} deleted successfully`,
      data: null,
    };
  }

  @Get('keys/:provider/models')
  @ApiOperation({ summary: 'Fetch model list for an already saved key' })
  @ApiParam({ name: 'provider', enum: LlmProvider })
  @ApiResponse({
    status: 200,
    description: 'List of available models',
    schema: apiEnvelopeSchema(
      {
        type: 'object',
        properties: {
          models: {
            type: 'array',
            items: { type: 'string' },
            example: ['gemini-2.0-flash', 'gemini-1.5-pro'],
          },
        },
      },
      { message: 'Available models for GEMINI retrieved successfully' },
    ),
  })
  async listModelsForProvider(
    @CurrentUser() user: any,
    @Param('provider', new ParseEnumPipe(LlmProvider)) provider: LlmProvider,
  ) {
    const models = await this.llmProviderService.listModelsForProvider(user.id, provider);
    return {
      success: true,
      message: `Available models for ${provider} retrieved successfully`,
      data: { models },
    };
  }

  @Get('active')
  @ApiOperation({ summary: 'Get current active provider and model' })
  @ApiResponse({
    status: 200,
    description: 'Current active provider and model',
    schema: apiEnvelopeSchema(
      {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            nullable: true,
            enum: Object.values(LlmProvider),
            example: 'GEMINI',
          },
          model: {
            type: 'string',
            nullable: true,
            example: 'gemini-2.0-flash',
          },
        },
      },
      { message: 'Active provider and model retrieved successfully' },
    ),
  })
  async getActiveProvider(@CurrentUser() user: any) {
    const active = await this.llmProviderService.getActive(user.id);
    return {
      success: true,
      message: 'Active provider and model retrieved successfully',
      data: active || { provider: null, model: null },
    };
  }

  @Put('active')
  @ApiOperation({ summary: 'Set active provider and model' })
  @ApiBody({ schema: zodToOpenApi(SetActiveProviderSchema) })
  @ApiResponse({
    status: 200,
    description: 'Active provider updated',
    schema: apiEnvelopeSchema(
      {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: Object.values(LlmProvider), example: 'GEMINI' },
          model: { type: 'string', example: 'gemini-2.0-flash' },
        },
      },
      { message: 'Active provider and model updated successfully' },
    ),
  })
  async setActiveProvider(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(SetActiveProviderSchema)) dto: SetActiveProviderDto,
  ) {
    await this.llmProviderService.setActive(user.id, dto.provider, dto.model);
    return {
      success: true,
      message: 'Active provider and model updated successfully',
      data: { provider: dto.provider, model: dto.model },
    };
  }
}


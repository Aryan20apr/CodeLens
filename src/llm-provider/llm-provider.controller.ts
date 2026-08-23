import { Controller, Get, Put, Delete, Body, Param, UseGuards, ParseEnumPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LlmProviderService } from './llm-provider.service';
import { SaveProviderKeyDto, SaveProviderKeySchema } from './dto/save-provider-key.dto';
import { SetActiveProviderDto, SetActiveProviderSchema } from './dto/set-active-provider.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { LlmProvider } from '../../generated/prisma/client';

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
  @ApiResponse({ status: 200, description: 'List of saved providers with masked keys' })
  async getStoredKeys(@CurrentUser() user: any) {
    return this.llmProviderService.getStoredKeys(user.id);
  }

  @Put('keys/:provider')
  @ApiOperation({ summary: 'Save or update an API key for a provider' })
  @ApiParam({ name: 'provider', enum: LlmProvider })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['apiKey'],
      properties: {
        apiKey: { type: 'string', minLength: 10, example: 'sk-proj-...' },
        baseUrl: { type: 'string', format: 'uri', example: 'https://integrate.api.nvidia.com/v1' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Key saved successfully, returns available models' })
  @ApiResponse({ status: 401, description: 'Invalid API key' })
  async saveKey(
    @CurrentUser() user: any,
    @Param('provider', new ParseEnumPipe(LlmProvider)) provider: LlmProvider,
    @Body(new ZodValidationPipe(SaveProviderKeySchema)) dto: SaveProviderKeyDto,
  ) {
    return this.llmProviderService.saveKey(user.id, provider, dto.apiKey, dto.baseUrl);
  }

  @Delete('keys/:provider')
  @ApiOperation({ summary: 'Delete a saved API key' })
  @ApiParam({ name: 'provider', enum: LlmProvider })
  @ApiResponse({ status: 200, description: 'Key deleted' })
  async deleteKey(
    @CurrentUser() user: any,
    @Param('provider', new ParseEnumPipe(LlmProvider)) provider: LlmProvider,
  ) {
    await this.llmProviderService.deleteKey(user.id, provider);
    return { success: true };
  }

  @Get('keys/:provider/models')
  @ApiOperation({ summary: 'Fetch model list for an already saved key' })
  @ApiParam({ name: 'provider', enum: LlmProvider })
  @ApiResponse({ status: 200, description: 'List of available models' })
  async listModelsForProvider(
    @CurrentUser() user: any,
    @Param('provider', new ParseEnumPipe(LlmProvider)) provider: LlmProvider,
  ) {
    const models = await this.llmProviderService.listModelsForProvider(user.id, provider);
    return { models };
  }

  @Get('active')
  @ApiOperation({ summary: 'Get current active provider and model' })
  @ApiResponse({ status: 200, description: 'Current active provider and model' })
  async getActiveProvider(@CurrentUser() user: any) {
    const active = await this.llmProviderService.getActive(user.id);
    return active || { provider: null, model: null };
  }

  @Put('active')
  @ApiOperation({ summary: 'Set active provider and model' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['provider', 'model'],
      properties: {
        provider: { type: 'string', enum: Object.values(LlmProvider), example: 'GEMINI' },
        model: { type: 'string', example: 'gemini-2.5-flash' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Active provider updated' })
  async setActiveProvider(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(SetActiveProviderSchema)) dto: SetActiveProviderDto,
  ) {
    await this.llmProviderService.setActive(user.id, dto.provider, dto.model);
    return { success: true };
  }
}


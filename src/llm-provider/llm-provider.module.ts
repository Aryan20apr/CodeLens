import { Module } from '@nestjs/common';
import { LlmProviderController } from './llm-provider.controller';
import { LlmProviderService } from './llm-provider.service';
import { ModelFetcherService } from './model-fetcher.service';

@Module({
  controllers: [LlmProviderController],
  providers: [LlmProviderService, ModelFetcherService],
  exports: [LlmProviderService],
})
export class LlmProviderModule {}

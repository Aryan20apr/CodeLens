import { Module } from '@nestjs/common';

import { AppConfigModule } from '../config/config.module';
import { DiffModule } from '../diff/diff.module';
import { LlmModule } from '../llm/llm.module';
import { GithubSearchProvider } from './context/github-search-provider.service';
import { GLOBAL_SEARCH_PROVIDER } from './context/global-search-provider.interface';
import { PrSearchToolExecutorService } from './context/pr-search-tool-executor.service';
import { PrReviewPromptService } from './pr-review-prompt.service';

@Module({
  imports: [AppConfigModule, LlmModule, DiffModule],
  providers: [
    GithubSearchProvider,
    {
      provide: GLOBAL_SEARCH_PROVIDER,
      useExisting: GithubSearchProvider,
    },
    PrSearchToolExecutorService,
    PrReviewPromptService,
  ],
  exports: [
    PrReviewPromptService,
    PrSearchToolExecutorService,
    GLOBAL_SEARCH_PROVIDER,
    GithubSearchProvider,
  ],
})
export class ReviewModule {}

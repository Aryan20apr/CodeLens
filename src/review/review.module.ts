import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { PrSummaryService } from './pr-summary.service';

@Module({
  imports: [LlmModule],
  providers: [PrSummaryService],
  exports: [PrSummaryService],
})
export class ReviewModule {}

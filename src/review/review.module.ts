import { Module } from '@nestjs/common';

import { DiffModule } from '../diff/diff.module';
import { LlmModule } from '../llm/llm.module';
import { PrSummaryService } from './pr-summary.service';

@Module({
  imports: [LlmModule, DiffModule],
  providers: [PrSummaryService],
  exports: [PrSummaryService],
})
export class ReviewModule {}

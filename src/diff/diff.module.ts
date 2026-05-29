import { Module } from '@nestjs/common';

import { DiffChunkerService } from './diff-chunker.service';
import { DiffChunkSerializerService } from './diff-chunk-serializer.service';
import { DiffParserService } from './diff-parser.service';

@Module({
  providers: [
    DiffParserService,
    DiffChunkerService,
    DiffChunkSerializerService,
  ],
  exports: [
    DiffParserService,
    DiffChunkerService,
    DiffChunkSerializerService,
  ],
})
export class DiffModule {}

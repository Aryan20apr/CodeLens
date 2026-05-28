import { Module } from '@nestjs/common';

import { DiffModule } from '../diff/diff.module';
import { GithubModule } from '../github/github.module';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';

@Module({
  imports: [GithubModule, DiffModule],
  controllers: [RepositoriesController],
  providers: [RepositoriesService],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}

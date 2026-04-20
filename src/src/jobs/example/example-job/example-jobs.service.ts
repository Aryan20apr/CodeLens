import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';

import { EXAMPLE_QUEUE } from '../../../../bullmq/queue.constants';

import type { ExampleJobPayload } from './example-jobs.processor';

@Injectable()
export class ExampleJobsService {
  constructor(
    @InjectQueue(EXAMPLE_QUEUE)
    private readonly exampleQueue: Queue<ExampleJobPayload>,
  ) {}

  async enqueue(
    data: ExampleJobPayload,
    opts?: JobsOptions,
  ): Promise<void> {
    await this.exampleQueue.add('example', data, opts);
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { EXAMPLE_QUEUE } from '../../../../bullmq/queue.constants';

export type ExampleJobPayload = {
  message: string;
};

@Processor(EXAMPLE_QUEUE)
export class ExampleJobsProcessor extends WorkerHost {
  private readonly logger = new Logger(ExampleJobsProcessor.name);

  async process(job: Job<ExampleJobPayload, void, string>): Promise<void> {
    this.logger.log(`Processing job ${job.id} name=${job.name}`);
    // TODO: domain work (call services, Prisma, etc.)
    this.logger.debug(`Payload: ${JSON.stringify(job.data)}`);
  }
}
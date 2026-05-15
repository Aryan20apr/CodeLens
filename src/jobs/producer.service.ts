import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { uuidv7 } from 'uuidv7';

import { CODE_REVIEW_JOB, CODE_REVIEW_QUEUE } from './constants';
import type { SnippetSource } from 'src/graph/state.types';
import type { CodeReviewJobPayload } from './dtos/code-review.dto';


@Injectable()
export class ProducerService {

    constructor(
        @InjectQueue(CODE_REVIEW_QUEUE) private readonly queue: Queue<CodeReviewJobPayload>
    ){}

    async enqueue(source: SnippetSource) {
        const threadId = uuidv7();
    
        const payload: CodeReviewJobPayload = {
          threadId,
          source,
        };
    
        const job = await this.queue.add(CODE_REVIEW_JOB, payload, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          // removeOnComplete: true,
          removeOnFail: false,
        });
    
        return { jobId: job.id, threadId };
      }
}

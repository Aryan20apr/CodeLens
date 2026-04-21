import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { ExampleJobsService } from './src/jobs/example/example-job/example-jobs.service';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly exampleJobs: ExampleJobsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Root greeting' })
  @ApiResponse({ status: 200, description: 'Plain text greeting' })
  getHello(): string {
    return this.appService.getHello();
  }

  /** Temporary: hit GET /enqueue-example to push one job onto the example queue. */
  @Get('enqueue-example')
  @ApiOperation({ summary: 'Enqueue one example BullMQ job' })
  @ApiResponse({ status: 200, description: 'Job enqueued' })
  async enqueueExample(): Promise<{ ok: true }> {
    await this.exampleJobs.enqueue({ message: 'hello' });
    return { ok: true };
  }
}

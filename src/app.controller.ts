import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ExampleJobsService } from './src/jobs/example/example-job/example-jobs.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly exampleJobs: ExampleJobsService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Temporary: hit GET /enqueue-example to push one job onto the example queue. */
  @Get('enqueue-example')
  async enqueueExample(): Promise<{ ok: true }> {
    await this.exampleJobs.enqueue({ message: 'hello' });
    return { ok: true };
  }
}

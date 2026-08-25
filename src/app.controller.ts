import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { ExampleJobsService } from './src/jobs/example/example-job/example-jobs.service';
import { apiEnvelopeSchema } from './common/utils/swagger.util';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly exampleJobs: ExampleJobsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Root greeting' })
  @ApiResponse({
    status: 200,
    description: 'API root greeting',
    schema: apiEnvelopeSchema(
      {
        type: 'object',
        properties: {
          greeting: { type: 'string', example: 'Hello World!' },
        },
      },
      { message: 'Welcome to CodeLens API' },
    ),
  })
  getHello() {
    return {
      success: true,
      message: 'Welcome to CodeLens API',
      data: {
        greeting: this.appService.getHello(),
      },
    };
  }

  /** Temporary: hit GET /enqueue-example to push one job onto the example queue. */
  @Get('enqueue-example')
  @ApiOperation({ summary: 'Enqueue one example BullMQ job' })
  @ApiResponse({
    status: 200,
    description: 'Job enqueued',
    schema: apiEnvelopeSchema(null, {
      message: 'Example job enqueued successfully',
    }),
  })
  async enqueueExample() {
    await this.exampleJobs.enqueue({ message: 'hello' });
    return {
      success: true,
      message: 'Example job enqueued successfully',
      data: null,
    };
  }
}

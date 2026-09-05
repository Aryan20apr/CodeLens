import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExampleJobsService } from './src/jobs/example/example-job/example-jobs.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ExampleJobsService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return greeting in standard response format', () => {
      expect(appController.getHello()).toEqual({
        success: true,
        message: 'Welcome to CodeLens API',
        data: {
          greeting: 'Hello World!',
        },
      });
    });
  });
});

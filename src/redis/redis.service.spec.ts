import { Test, TestingModule } from '@nestjs/testing';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

import { RedisService } from './redis.service';
import { REDIS_CACHE } from './redis.constants';

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    const mockLogger = {
      child: () => mockLogger,
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      eval: jest.fn(),
      scanStream: jest.fn(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield [];
        },
      })),
      unlink: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: WINSTON_MODULE_PROVIDER, useValue: mockLogger },
        { provide: REDIS_CACHE, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

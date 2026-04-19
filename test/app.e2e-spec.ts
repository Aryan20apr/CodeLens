import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', async () => {
    const res = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'GET', url: '/api/v1' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('Hello World!');
  });

  it('returns X-Correlation-Id with a UUID', async () => {
    const res = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'GET', url: '/api/v1' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-correlation-id']).toBeDefined();
    const id = res.headers['x-correlation-id'] as string;
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

import { Inject } from '@nestjs/common';

export const InjectRedis = (token: symbol) => Inject(token);

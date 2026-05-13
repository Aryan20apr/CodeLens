import { Module } from '@nestjs/common';
import { EvaluationController } from './eval.controller';
import { GraphModule } from 'src/graph/graph.module';

@Module({
  imports: [GraphModule],
  controllers: [EvaluationController]
})
export class EvalModule {}

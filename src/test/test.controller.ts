import { Body, Controller, Post, UseGuards, UsePipes, } from "@nestjs/common";
import { uuidv7 } from "uuidv7";
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { zodToOpenApi } from '../common/utils/zod-to-openapi.util';
import { GraphFactory } from "src/graph/graph.factory";
import { SnippetEvaluateDtoSchema, type SnippetReviewDto } from "./dto/snippet-review.dto";
import { Public } from "@common/decorators/public.decorator";
import { ApiOperation, ApiBody, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "@common/guards/jwt-auth.guard";

@Controller("test")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class EvaluationController {
  constructor(private readonly graphFactory: GraphFactory) {}


  @Post("/snippet")
  @UsePipes(new ZodValidationPipe(SnippetEvaluateDtoSchema))
  @ApiOperation({ summary: 'Test endpoint for Snippet code review' })
  @ApiBody({ schema: zodToOpenApi(SnippetEvaluateDtoSchema) })
  @ApiResponse({
    status: 201,
    description:
      'Test endpoint for Snippet code review',
    schema: {
      properties: {
        threadId: { type: 'string', format: 'uuid' },
        status: { type: 'string', example: 'pending' },
        error: { type: 'string', nullable: true },
        language: { type: 'string', example: 'javascript' },
        metadata: { type: 'object', nullable: true },
        llmAnalysis: { type: 'object', nullable: true },
        score: { type: 'object', nullable: true },
        report: { type: 'object', nullable: true },
        events: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  async evaluate(@Body() dto: SnippetReviewDto) {
    const threadId = dto.threadId?.trim() || uuidv7();

    const out = await this.graphFactory.invokeSnippet(
      {
        type: "snippet",
        code: dto.code,
        language: dto.language ?? "",
        filename: dto.filename,
      },
      threadId,
    );

    return {
      threadId,
      status: out.status,
      error: out.error,
      language: out.language,
      metadata: out.metadata,
      llmAnalysis: out.llmAnalysis,
      score: out.score,
      report: out.report,
      events: out.events,
    };
  }
}
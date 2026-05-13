// src/snippet-evaluation/snippet-evaluation.controller.ts

import { Body, Controller, Post } from "@nestjs/common";
import { uuidv7 } from "uuidv7";

import { GraphFactory } from "src/graph/graph.factory";
import { SnippetEvaluateDtoSchema, type SnippetEvaluateDto } from "./dto/snippet-eva.dto";
import { Public } from "@common/decorators/public.decorator";

@Controller("test")
@Public()
export class EvaluationController {
  constructor(private readonly graphFactory: GraphFactory) {}


  @Post("/snippet")
  async evaluate(@Body() body: SnippetEvaluateDto) {
    const dto = SnippetEvaluateDtoSchema.parse(body);

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
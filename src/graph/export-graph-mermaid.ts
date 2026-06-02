import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';

import { GraphFactory } from './graph.factory';
import { GraphMermaidExportModule } from './graph-mermaid-export.module';
import { getGraphMermaid } from './get-graph-mermaid.util';
import { PrAnalyzeAgentFactory } from './pr/analyze/analyze-agent.factory';
import { PrReviewGraphFactory } from './pr/prreviewgraph.factory';

const GRAPH_EXPORTS = [
  { slug: 'snippet', factory: GraphFactory },
  { slug: 'pr-review', factory: PrReviewGraphFactory },
  { slug: 'analyze-agent', factory: PrAnalyzeAgentFactory },
] as const;

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [GraphMermaidExportModule],
  }).compile();

  await moduleRef.init();

  const outDir = join(process.cwd(), 'docs', 'graphs');
  await mkdir(outDir, { recursive: true });

  for (const { slug, factory: Factory } of GRAPH_EXPORTS) {
    const factory = moduleRef.get(Factory);
    const mermaid = await getGraphMermaid(factory.getCompiledGraph());
    const filePath = join(outDir, `${slug}.mmd`);
    await writeFile(filePath, mermaid, 'utf8');
    console.log(`Wrote ${filePath}`);
  }

  await moduleRef.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

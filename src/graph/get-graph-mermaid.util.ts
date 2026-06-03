/** Compiled LangGraph runnable with the core visualization API. */
type GraphVisualizationSource = {
  getGraphAsync(config?: Record<string, unknown>): Promise<{
    drawMermaid(params?: {
      withStyles?: boolean;
      curveStyle?: string;
      nodeColors?: Record<string, string>;
      wrapLabelNWords?: number;
    }): string;
  }>;
};

export async function getGraphMermaid(
  compiledGraph: GraphVisualizationSource,
): Promise<string> {
  const drawable = await compiledGraph.getGraphAsync();
  return drawable.drawMermaid();
}

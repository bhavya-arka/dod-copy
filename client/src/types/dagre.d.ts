declare module 'dagre' {
  export namespace graphlib {
    class Graph {
      constructor(opts?: { compound?: boolean; directed?: boolean; multigraph?: boolean });
      setDefaultEdgeLabel(callback: () => object): void;
      setGraph(label: object): void;
      setNode(name: string, label?: object): void;
      setEdge(v: string, w: string, label?: object, name?: string): void;
      node(name: string): { x: number; y: number; width: number; height: number };
      nodes(): string[];
      edges(): Array<{ v: string; w: string }>;
    }
  }
  export function layout(graph: graphlib.Graph): void;
}

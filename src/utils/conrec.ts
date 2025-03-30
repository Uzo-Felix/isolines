import RBush from "rbush";

type Point = { x: number; y: number };
type Segment = { start: Point; end: Point };
type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number; segment: Segment };

class Conrec {
  private grid: number[][];
  private xSize: number;
  private ySize: number;
  private levels: number[];
  private rtree: RBush<BoundingBox>;

  constructor(grid: number[][], levels: number[]) {
    this.grid = grid;
    this.ySize = grid.length;
    this.xSize = grid[0].length;
    this.levels = levels;
    this.rtree = new RBush<BoundingBox>();
  }

  public generateIsolines(): Segment[][] {
    const isolines: Segment[][] = [];

    for (const level of this.levels) {
      const segments: Segment[] = [];
      for (let i = 0; i < this.xSize - 1; i++) {
        for (let j = 0; j < this.ySize - 1; j++) {
          const square = [
            { x: i, y: j, value: this.grid[j][i] },
            { x: i + 1, y: j, value: this.grid[j][i + 1] },
            { x: i + 1, y: j + 1, value: this.grid[j + 1][i + 1] },
            { x: i, y: j + 1, value: this.grid[j + 1][i] }
          ];

          this.processSquare(square, level, segments);
        }
      }

      // Insert segments into R-Tree for fast lookups
      segments.forEach(segment => this.insertIntoRTree(segment));

      // Connect segments into complete isolines
      const connectedIsolines = this.connectIsolines(segments);
      isolines.push(connectedIsolines);
    }

    return isolines;
  }

  private processSquare(square: { x: number; y: number; value: number }[], level: number, segments: Segment[]) {
    const crossings: Point[] = [];

    for (let i = 0; i < 4; i++) {
      const p1 = square[i];
      const p2 = square[(i + 1) % 4];

      if ((p1.value < level && p2.value >= level) || (p2.value < level && p1.value >= level)) {
        const ratio = (level - p1.value) / (p2.value - p1.value);
        crossings.push({
          x: p1.x + ratio * (p2.x - p1.x),
          y: p1.y + ratio * (p2.y - p1.y)
        });
      }
    }

    if (crossings.length === 2) {
      const segment = { start: crossings[0], end: crossings[1] };
      segments.push(segment);
    }
  }

  private insertIntoRTree(segment: Segment) {
    this.rtree.insert({
      minX: Math.min(segment.start.x, segment.end.x),
      minY: Math.min(segment.start.y, segment.end.y),
      maxX: Math.max(segment.start.x, segment.end.x),
      maxY: Math.max(segment.start.y, segment.end.y),
      segment
    });
  }

  private connectIsolines(segments: Segment[]): Segment[] {
    const connected: Segment[] = [];
    const visited = new Set<Segment>();

    for (const segment of segments) {
      if (visited.has(segment)) continue;

      let currentSegment = segment;
      let isoline: Segment[] = [currentSegment];
      visited.add(currentSegment);

      while (true) {
        const neighbors = this.rtree.search({
          minX: currentSegment.end.x - 0.1, maxX: currentSegment.end.x + 0.1,
          minY: currentSegment.end.y - 0.1, maxY: currentSegment.end.y + 0.1
        });

        const nextSegment = neighbors.find(n => !visited.has(n.segment))?.segment;
        if (!nextSegment) break;

        isoline.push(nextSegment);
        visited.add(nextSegment);
        currentSegment = nextSegment;
      }

      connected.push(...isoline);
    }

    return connected;
  }
}


export default Conrec;
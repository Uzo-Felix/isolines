import mslData from '../mslData'
type Point = { x: number; y: number };
type Segment = { start: Point; end: Point };
type Grid = number[][];

class Conrec {
  private grid: Grid;
  private xSize: number;
  private ySize: number;
  private levels: number[];

  constructor(grid: Grid, levels: number[]) {
    this.grid = grid;
    this.ySize = grid.length;
    this.xSize = grid[0].length;
    this.levels = levels;
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
      isolines.push(segments);
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
      segments.push({ start: crossings[0], end: crossings[1] });
    }
  }
}

const levels = [10, 12];
const conrec = new Conrec(mslData, levels);
const isolines = conrec.generateIsolines();

console.log(isolines);

export default Conrec;

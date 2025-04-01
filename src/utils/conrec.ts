export interface Point {
  lat: number;
  lon: number;
}

export interface Segment {
  p1: Point;
  p2: Point;
}

export class Conrec {
  private static readonly EPSILON = 0.0001;

  computeSegments(grid: number[][], levels: number[]): Segment[] {
    const segments: Segment[] = [];
    const rows = grid.length;
    const cols = grid[0].length;

    for (let lat = 0; lat < rows - 1; lat++) {
      for (let lon = 0; lon < cols - 1; lon++) {
        const z = [
          grid[lat][lon],         
          grid[lat][lon + 1],    
          grid[lat + 1][lon + 1], 
          grid[lat + 1][lon]      
        ];

        for (const level of levels) {
          this.processGridCell(z, level, lat, lon, segments);
        }
      }
    }
    return segments;
  }

  private processGridCell(z: number[], level: number, lat: number, lon: number, segments: Segment[]): void {
    let caseIndex = 0;
    if (z[0] >= level) caseIndex |= 1;
    if (z[1] >= level) caseIndex |= 2;
    if (z[2] >= level) caseIndex |= 4;
    if (z[3] >= level) caseIndex |= 8;

    if (caseIndex === 0 || caseIndex === 15) return;

    const points: Point[] = [];
    
    if ((caseIndex & 1) !== ((caseIndex & 2) >> 1)) {
      points.push(this.interpolate(z[0], z[1], level, lat, lon, lat, lon + 1));
    }
    
    if ((caseIndex & 2) !== ((caseIndex & 4) >> 1)) {
      points.push(this.interpolate(z[1], z[2], level, lat, lon + 1, lat + 1, lon + 1));
    }
    
    if ((caseIndex & 4) !== ((caseIndex & 8) >> 1)) {
      points.push(this.interpolate(z[2], z[3], level, lat + 1, lon + 1, lat + 1, lon));
    }
    
    if ((caseIndex & 8) !== ((caseIndex & 1) << 3)) {
      points.push(this.interpolate(z[3], z[0], level, lat + 1, lon, lat, lon));
    }

    if (points.length === 2) {
      segments.push({ p1: points[0], p2: points[1] });
    } else if (points.length === 4) {
      segments.push({ p1: points[0], p2: points[1] });
      segments.push({ p1: points[2], p2: points[3] });
    }
  }

  private interpolate(z1: number, z2: number, level: number, lat1: number, lon1: number, lat2: number, lon2: number): Point {
    if (Math.abs(z1 - z2) < Conrec.EPSILON) {
      return { lat: lat1, lon: lon1 };
    }
    
    const t = (level - z1) / (z2 - z1);
    return {
      lat: lat1 + t * (lat2 - lat1),
      lon: lon1 + t * (lon2 - lon1)
    };
  }
}

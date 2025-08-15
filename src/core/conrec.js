class Conrec {
  constructor(epsilon = 0.0001) {
    this.EPSILON = epsilon;
  }

  preprocessGrid(grid) {
    if (!grid || grid.length === 0 || !grid[0] || grid[0].length === 0) {
      return grid;
    }

    const rows = grid.length;
    const cols = grid[0].length;

    const processedGrid = grid.map(row => [...row]);

    if (rows > 0) {
      const northPoleValue = processedGrid[0].reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0) /
        processedGrid[0].filter(val => !isNaN(val)).length;

      processedGrid[0] = Array(cols).fill(northPoleValue);
    }

    if (rows > 1) {
      const southPoleValue = processedGrid[rows - 1].reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0) /
        processedGrid[rows - 1].filter(val => !isNaN(val)).length;

      processedGrid[rows - 1] = Array(cols).fill(southPoleValue);
    }

    if (cols > 1) {
      for (let i = 0; i < rows; i++) {
        processedGrid[i][0] = processedGrid[i][cols - 1] =
          (processedGrid[i][0] + processedGrid[i][cols - 1]) / 2;
      }
    }

    return processedGrid;
  }

  computeSegments(grid, levels) {
    const processedGrid = this.preprocessGrid(grid);

    const segments = [];
    const rows = processedGrid.length;
    const cols = processedGrid[0].length;

    for (let lat = 0; lat < rows - 1; lat++) {
      for (let lon = 0; lon < cols - 1; lon++) {
        const z = [
          processedGrid[lat][lon],
          processedGrid[lat][lon + 1],
          processedGrid[lat + 1][lon + 1],
          processedGrid[lat + 1][lon]
        ];

        for (const level of levels) {
          this.processGridCell(z, level, lat, lon, segments);
        }
      }
    }
    return segments;
  }

  processGridCell(z, level, lat, lon, segments) {
    let caseIndex = 0;
    if (z[0] >= level) caseIndex |= 1;
    if (z[1] >= level) caseIndex |= 2;
    if (z[2] >= level) caseIndex |= 4;
    if (z[3] >= level) caseIndex |= 8;

    if (caseIndex === 0 || caseIndex === 15) return;

    const points = [];

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
      segments.push({
        p1: points[0],
        p2: points[1],
        level: level
      });
    } else if (points.length === 4) {
      segments.push({
        p1: points[0],
        p2: points[1],
        level: level
      });
      segments.push({
        p1: points[2],
        p2: points[3],
        level: level
      });
    }
  }

  interpolate(z1, z2, level, lat1, lon1, lat2, lon2) {
    if (Math.abs(z1 - z2) < this.EPSILON) {
      return { lat: lat1, lon: lon1 };
    }

    const t = (level - z1) / (z2 - z1);
    return {
      lat: lat1 + t * (lat2 - lat1),
      lon: lon1 + t * (lon2 - lon1)
    };
  }

  normalizeAntimeridian(lon) {
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return lon;
  }
}

module.exports = Conrec;

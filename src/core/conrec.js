class Conrec {
  constructor() {
    this.EPSILON = 0.0001;
  }

  preprocessGrid(grid) {
    if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0]) || grid[0].length === 0) {
      return [];
    }

    const rows = grid.length;
    const cols = grid[0].length;
    const processedGrid = grid.map(row => Array.isArray(row) ? [...row] : []);

    // Normalize poles
    if (rows > 0 && Array.isArray(processedGrid[0]) && processedGrid[0].length === cols) {
      const validTop = processedGrid[0].filter(val => typeof val === 'number' && !isNaN(val));
      if (validTop.length > 0) {
        const northPoleValue = validTop.reduce((sum, val) => sum + val, 0) / validTop.length;
        processedGrid[0] = Array(cols).fill(northPoleValue);
      }
    }

    if (rows > 1 && Array.isArray(processedGrid[rows - 1]) && processedGrid[rows - 1].length === cols) {
      const validBottom = processedGrid[rows - 1].filter(val => typeof val === 'number' && !isNaN(val));
      if (validBottom.length > 0) {
        const southPoleValue = validBottom.reduce((sum, val) => sum + val, 0) / validBottom.length;
        processedGrid[rows - 1] = Array(cols).fill(southPoleValue);
      }
    }

    // Normalize antimeridian wrap
    if (cols > 1) {
      for (let i = 0; i < rows; i++) {
        const left = processedGrid[i][0];
        const right = processedGrid[i][cols - 1];
        const leftOk = typeof left === 'number' && !isNaN(left);
        const rightOk = typeof right === 'number' && !isNaN(right);

        if (leftOk && rightOk) {
          const avg = (left + right) / 2;
          processedGrid[i][0] = avg;
          processedGrid[i][cols - 1] = avg;
        } else if (leftOk && !rightOk) {
          processedGrid[i][cols - 1] = left;
        } else if (!leftOk && rightOk) {
          processedGrid[i][0] = right;
        }
      }
    }

    return processedGrid;
  }

  computeSegments(grid, levels) {
    const processedGrid = this.preprocessGrid(grid);

    if (
      !Array.isArray(processedGrid) ||
      processedGrid.length < 2 ||
      !Array.isArray(processedGrid[0]) ||
      processedGrid[0].length < 2 ||
      !Array.isArray(levels) ||
      levels.length === 0
    ) {
      return [];
    }

    const segments = [];
    const rows = processedGrid.length;
    const cols = processedGrid[0].length;

    // Process each cell for each level
    for (const level of levels) {
      for (let lat = 0; lat < rows - 1; lat++) {
        for (let lon = 0; lon < cols - 1; lon++) {
          const cellSegments = this.processCell(
            processedGrid,
            level,
            lat,
            lon
          );
          
          for (const seg of cellSegments) {
            segments.push({
              p1: seg.p1,
              p2: seg.p2,
              level: level,
              caseIndex: seg.caseIndex,
              z: seg.z,
              cellLat: lat,
              cellLon: lon
            });
          }
        }
      }
    }

    return segments;
  }

  /**
   * Process a single cell using proper Conrec algorithm
   * Divides cell into 4 triangles using diagonals and center point
   */
  processCell(grid, level, lat, lon) {
    const segments = [];
    
    // Get 4 corner values
    const z0 = grid[lat][lon];           // top-left
    const z1 = grid[lat][lon + 1];       // top-right
    const z2 = grid[lat + 1][lon + 1];   // bottom-right
    const z3 = grid[lat + 1][lon];       // bottom-left

    // Calculate center point value (average of 4 corners)
    const zc = (z0 + z1 + z2 + z3) / 4;

    // Corner coordinates
    const c0 = { lat, lon };
    const c1 = { lat, lon: lon + 1 };
    const c2 = { lat: lat + 1, lon: lon + 1 };
    const c3 = { lat: lat + 1, lon };
    const cc = { lat: lat + 0.5, lon: lon + 0.5 };

    const z = [z0, z1, z2, z3];
    const caseIndex = this.getCaseIndex(z, level);

    // Process 4 triangles formed by diagonals
    // Triangle 1: top-left (c0, c1, cc)
    const tri1 = this.processTriangle(z0, z1, zc, c0, c1, cc, level);
    segments.push(...tri1);

    // Triangle 2: top-right (c1, c2, cc)
    const tri2 = this.processTriangle(z1, z2, zc, c1, c2, cc, level);
    segments.push(...tri2);

    // Triangle 3: bottom-right (c2, c3, cc)
    const tri3 = this.processTriangle(z2, z3, zc, c2, c3, cc, level);
    segments.push(...tri3);

    // Triangle 4: bottom-left (c3, c0, cc)
    const tri4 = this.processTriangle(z3, z0, zc, c3, c0, cc, level);
    segments.push(...tri4);

    // Attach metadata to all segments
    segments.forEach(seg => {
      seg.z = z;
      seg.caseIndex = caseIndex;
    });

    return segments;
  }

  /**
   * Process a single triangle (3 vertices)
   * 10 cases: a, b, c, d, e, f, g, h, i, j
   */
  processTriangle(z0, z1, z2, c0, c1, c2, level) {
    const segments = [];

    // Determine case: count how many vertices are below level
    const below = [
      z0 < level,
      z1 < level,
      z2 < level
    ];

    const countBelow = below.filter(b => b).length;
    
    // Count vertices exactly on level
    const onLevel = [
      Math.abs(z0 - level) < this.EPSILON,
      Math.abs(z1 - level) < this.EPSILON,
      Math.abs(z2 - level) < this.EPSILON
    ];

    const countOn = onLevel.filter(b => b).length;

    // Determine topological case
    // Cases a, j: all below or all above (no intersection) - skip
    if (countBelow === 0 || countBelow === 3) {
      return segments;
    }

    // Case b: 2 below, 1 on
    // Cases d, h: 1 below + 2 on, or 2 above + 1 on
    if ((countBelow === 2 && countOn === 1) || (countBelow === 1 && countOn === 2)) {
      // Draw line between the two vertices on the level
      const onIdx = onLevel.map((v, i) => v ? i : -1).filter(i => i >= 0);
      if (onIdx.length === 2) {
        const pts = [c0, c1, c2];
        segments.push({
          p1: pts[onIdx[0]],
          p2: pts[onIdx[1]]
        });
      }
      return segments;
    }

    // Case e: 1 below, 1 on, 1 above
    if (countBelow === 1 && countOn === 1) {
      const belowIdx = below.findIndex(b => b);
      const onIdx = onLevel.findIndex(b => b);
      const aboveIdx = [0, 1, 2].find(i => !below[i] && !onLevel[i]);

      const belowPt = [c0, c1, c2][belowIdx];
      const onPt = [c0, c1, c2][onIdx];
      const abovePt = [c0, c1, c2][aboveIdx];
      const zBelow = [z0, z1, z2][belowIdx];
      const zAbove = [z0, z1, z2][aboveIdx];

      // Interpolate on edge between below and above vertices
      const interpPt = this.interpolate(zBelow, zAbove, level, belowPt, abovePt);
      segments.push({
        p1: onPt,
        p2: interpPt
      });
      return segments;
    }

    // Cases c, f: 2 below + 1 above, or 1 below + 2 above (most common)
    if (countBelow === 2) {
      // 2 below, 1 above
      const aboveIdx = below.findIndex(b => !b);
      const belowIdx = [0, 1, 2].filter(i => below[i]);

      const abovePt = [c0, c1, c2][aboveIdx];
      const zAbove = [z0, z1, z2][aboveIdx];

      // Interpolate on edges from below vertices to above vertex
      const z1Below = [z0, z1, z2][belowIdx[0]];
      const z2Below = [z0, z1, z2][belowIdx[1]];
      const c1Below = [c0, c1, c2][belowIdx[0]];
      const c2Below = [c0, c1, c2][belowIdx[1]];

      const p1 = this.interpolate(z1Below, zAbove, level, c1Below, abovePt);
      const p2 = this.interpolate(z2Below, zAbove, level, c2Below, abovePt);

      segments.push({ p1, p2 });
    } else if (countBelow === 1) {
      // 1 below, 2 above
      const belowIdx = below.findIndex(b => b);
      const aboveIdx = [0, 1, 2].filter(i => !below[i]);

      const belowPt = [c0, c1, c2][belowIdx];
      const zBelow = [z0, z1, z2][belowIdx];

      // Interpolate on edges from below vertex to above vertices
      const z1Above = [z0, z1, z2][aboveIdx[0]];
      const z2Above = [z0, z1, z2][aboveIdx[1]];
      const c1Above = [c0, c1, c2][aboveIdx[0]];
      const c2Above = [c0, c1, c2][aboveIdx[1]];

      const p1 = this.interpolate(zBelow, z1Above, level, belowPt, c1Above);
      const p2 = this.interpolate(zBelow, z2Above, level, belowPt, c2Above);

      segments.push({ p1, p2 });
    }

    // Case g: all 3 on level (rare, ambiguous) - ignored

    return segments;
  }

  /**
   * Linear interpolation on an edge
   */
  interpolate(z1, z2, level, c1, c2) {
    if (Math.abs(z1 - z2) < this.EPSILON) {
      return c1;
    }

    const t = (level - z1) / (z2 - z1);
    return {
      lat: c1.lat + t * (c2.lat - c1.lat),
      lon: c1.lon + t * (c2.lon - c1.lon)
    };
  }

  /**
   * Get case index for the cell (for metadata)
   */
  getCaseIndex(z, level) {
    let caseIndex = 0;
    for (let i = 0; i < 4; i++) {
      if (z[i] < level) {
        caseIndex |= (1 << i);
      }
    }
    return caseIndex;
  }

  normalizeAntimeridian(lon) {
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return lon;
  }
}

module.exports = Conrec;

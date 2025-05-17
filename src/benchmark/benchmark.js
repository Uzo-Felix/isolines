const { Conrec, IsolineBuilder, SpatialIndex } = require('../index.js');

async function main() {
  const RBush = (await import('rbush')).default;

  /**
   * Create a test grid with a simple pattern
   */
  function createGrid(width, height) {
    const grid = [];
    for (let i = 0; i < height; i++) {
      const row = [];
      for (let j = 0; j < width; j++) {
        const x = j / width * 10 - 5;
        const y = i / height * 10 - 5;
        const value = Math.sin(x * x + y * y) * 100;
        row.push(value);
      }
      grid.push(row);
    }
    return grid;
  }

  /**
   * Generate contour levels based on grid values and step
   */
  function generateLevels(grid, step) {
    let min = Infinity;
    let max = -Infinity;
    
    for (let i = 0; i < grid.length; i++) {
      for (let j = 0; j < grid[i].length; j++) {
        min = Math.min(min, grid[i][j]);
        max = Math.max(max, grid[i][j]);
      }
    }
    
    const levels = [];
    for (let level = Math.ceil(min / step) * step; level <= max; level += step) {
      levels.push(level);
    }
    
    return levels;
  }

  /**
   * Custom IsolineBuilder that uses R-Tree
   */
  class RTreeIsolineBuilder extends IsolineBuilder {
    constructor() {
      super();
      this.rtree = new RBush();
    }
    
    buildIsolines(segments, gridResolution = 1) {
      const items = segments.map((segment, id) => {
        const minLat = Math.min(segment.p1.lat, segment.p2.lat);
        const minLon = Math.min(segment.p1.lon, segment.p2.lon);
        const maxLat = Math.max(segment.p1.lat, segment.p2.lat);
        const maxLon = Math.max(segment.p1.lon, segment.p2.lon);
        
        return {
          minX: minLon,
          minY: minLat,
          maxX: maxLon,
          maxY: maxLat,
          segment,
          id
        };
      });
      
      this.rtree.load(items);
      return super.buildIsolines(segments, gridResolution);
    }
  }

  /**
   * Run a single benchmark
   */
  async function benchmarkRun(builderType, grid, levels) {
    const conrecStart = process.hrtime.bigint();
    const conrec = new Conrec();
    const segments = conrec.computeSegments(grid, levels);
    const conrecTime = process.hrtime.bigint() - conrecStart;
    
    let builder;
    if (builderType === 'grid') {
      builder = new IsolineBuilder();
    } else if (builderType === 'rtree') {
      builder = new RTreeIsolineBuilder();
    } else {
      throw new Error(`Unknown builder type: ${builderType}`);
    }
    
    
    const buildStart = process.hrtime.bigint();
    const isolines = builder.buildIsolines(segments);
    const buildTime = process.hrtime.bigint() - buildStart;
    
    return {
      conrec: Number(conrecTime) / 1e6, // ms
      build: Number(buildTime) / 1e6,
      total: Number(conrecTime + buildTime) / 1e6,
      segments: segments.length,
      isolines: isolines.length
    };
  }

  /**
   * Run the complete benchmark
   */
  async function runBenchmark(gridSize, steps) {
    console.log(`Running benchmark with ${gridSize}x${gridSize} grid...`);
    
    const results = [];
    
    for (const step of steps) {
      console.log(`Testing step: ${step}`);
      
      const grid = createGrid(gridSize, gridSize);
      const levels = generateLevels(grid, step);
      
      console.log(`  Generated ${levels.length} contour levels`);
      
      console.log('  Running with Grid-based indexing...');
      const gridResult = await benchmarkRun('grid', grid, levels);
      
      console.log('  Running with R-Tree indexing...');
      const rtreeResult = await benchmarkRun('rtree', grid, levels);
      
      results.push({ 
        step, 
        levels: levels.length,
        segments: gridResult.segments,
        gridResult, 
        rtreeResult 
      });
    }
    
    return results;
  }

  /**
   * Format and print results as a table
   */
  function printResults(results) {
    console.log('\nBenchmark Results:');
    console.log('------------------------------------------------------------------------------------------------------------------');
    console.log('| Step | Levels | Segments | CONREC (ms) | Grid Build (ms) | Grid Total | R-Tree Build (ms) | R-Tree Total | Ratio |');
    console.log('|------|--------|----------|-------------|-----------------|------------|-------------------|--------------|-------|');
    
    for (const result of results) {
      const ratio = (result.rtreeResult.total / result.gridResult.total).toFixed(2);
      
      console.log(
        `| ${result.step.toString().padEnd(4)} | ` +
        `${result.levels.toString().padEnd(6)} | ` +
        `${result.segments.toString().padEnd(8)} | ` +
        `${result.gridResult.conrec.toFixed(2).padEnd(11)} | ` +
        `${result.gridResult.build.toFixed(2).padEnd(15)} | ` +
        `${result.gridResult.total.toFixed(2).padEnd(10)} | ` +
        `${result.rtreeResult.build.toFixed(2).padEnd(17)} | ` +
        `${result.rtreeResult.total.toFixed(2).padEnd(12)} | ` +
        `${ratio.padEnd(5)} |`
      );
    }
    
    console.log('------------------------------------------------------------------------------------------------------------------');
  }

  const GRID_SIZE = 128;
  const STEPS = [1, 2, 5, 10, 20, 50]; 

  console.log('Starting benchmark...');
  runBenchmark(GRID_SIZE, STEPS)
    .then(printResults)
    .catch(err => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}

main().catch(err => {
  console.error('Failed to initialize benchmark:', err);
  process.exit(1);
});

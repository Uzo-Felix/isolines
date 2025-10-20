/**
 * Tiled Algorithm Selector
 * Integrates with existing visualization tools
 */
const LineStringBasedTiledBuilder = require('./linestring-based');
const PolygonBasedTiledBuilder = require('./polygon-based');
const StripBasedTiledBuilder = require('./strip-based');
const OverlappingTileAlgorithm = require('./overlapping-tile');
const { bufferedTileIsolines } = require('./buffered-tile');

const ALGORITHMS = {
    LINESTRING: 'linestring',
    POLYGON: 'polygon',
    STRIP: 'strip',
    OVERLAPPING: 'overlapping',
    BUFFER: 'buffer'
};

/**
 * Create tiled algorithm instance
 */
function createTiledBuilder(algorithm, levels, tileSize, options = {}) {
    switch (algorithm.toLowerCase()) {
        case ALGORITHMS.LINESTRING:
            return new LineStringBasedTiledBuilder(levels, tileSize, options);
            
        case ALGORITHMS.POLYGON:
            return new PolygonBasedTiledBuilder(levels, tileSize, options);
            
        case ALGORITHMS.STRIP:
            return new StripBasedTiledBuilder(levels, tileSize, options);
            
        default:
            throw new Error(`Unknown algorithm: ${algorithm}`);
    }
}

/**
 * Generate tiled isolines (compatible with existing tools)
 * Drop-in replacement for existing generateTiledIsolines()
 */
function generateTiledIsolines(grid, levels, options = {}) {

     if (options.algorithm === 'buffer') {
      const initialGeoJSON = bufferedTileIsolines(grid, levels, options.tileSize || 64, options.buffer || 1);
      const mergedGeoJSON = mergeLineStringsByLevel(initialGeoJSON, 1e-6);
      return mergedGeoJSON;
    }

    // Handle overlapping tile algorithm separately (doesn't use tile-by-tile processing)
    if (options.algorithm === ALGORITHMS.OVERLAPPING) {
        const tileSize = options.tileSize || 64;
        console.log(`Generating tiled isolines using ${options.algorithm} algorithm...`);
        
        const overlappingAlgorithm = new OverlappingTileAlgorithm();
        const result = overlappingAlgorithm.getIsolinesAsGeoJSON(grid, levels, tileSize);
        
        console.log(`Built ${result.features.length} overlapping-tile isolines`);
        return result;
    }
    
    const algorithm = options.algorithm || ALGORITHMS.LINESTRING;
    const tileSize = 64;
    
    console.log(`Generating tiled isolines using ${algorithm} algorithm...`);
    
    const builder = createTiledBuilder(algorithm, levels, tileSize, options);
    
    const height = grid.length;
    const width = grid[0].length;
    
    const tilesY = Math.ceil(height / tileSize);
    const tilesX = Math.ceil(width / tileSize);
    
    console.log(`Grid split into ${tilesX}x${tilesY} tiles (${tileSize}x${tileSize})`);
    
    // Process tiles
    for (let i = 0; i < tilesY; i++) {
        for (let j = 0; j < tilesX; j++) {
            const tileData = extractTileFromGrid(grid, width, height, j, i, tileSize);
            builder.addTile(i, j, tileData);
            
            if ((i * tilesX + j + 1) % 10 === 0) {
                console.log(`Processed ${i * tilesX + j + 1}/${tilesX * tilesY} tiles...`);
            }
        }
    }
    
    const result = builder.getIsolinesAsGeoJSON();
    console.log(`Built ${result.features.length} tiled isolines`);
    
    return result;
}

/**
 * Extract tile from grid (matches existing function)
 */
function extractTileFromGrid(grid, width, height, tileX, tileY, tileSize) {
    const tileData = [];
    
    const startY = tileY * tileSize;
    const endY = Math.min(startY + tileSize, height);
    const startX = tileX * tileSize;
    const endX = Math.min(startX + tileSize, width);

    for (let y = startY; y < endY; y++) {
        const row = [];
        for (let x = startX; x < endX; x++) {
            row.push(y < grid.length && x < grid[y].length ? grid[y][x] : 0);
        }
        tileData.push(row);
    }

    return tileData;
}

/**
 * Merge fragmented LineStrings (from tiled output) into continuous features by level.
 * @param {Object} geojson - FeatureCollection of LineStrings (buffered tile output)
 * @param {number} tolerance - Endpoint matching tolerance (in grid units)
 * @returns {Object} - FeatureCollection with merged LineStrings (and closed as Polygons)
 */
function mergeLineStringsByLevel(geojson, tolerance = 1e-6) {
  // Group features by contour level
  const byLevel = {};
  for (const feature of geojson.features) {
    if (feature.geometry.type !== 'LineString') continue;
    const level = feature.properties.level;
    if (!byLevel[level]) byLevel[level] = [];
    byLevel[level].push(feature.geometry.coordinates);
  }

  const mergedFeatures = [];

  for (const [level, lines] of Object.entries(byLevel)) {
    // Merge lines by connecting endpoints
    const chains = [];
    const used = new Array(lines.length).fill(false);

    for (let i = 0; i < lines.length; i++) {
      if (used[i]) continue;
      let chain = [...lines[i]];
      used[i] = true;
      let extended = true;
      while (extended) {
        extended = false;
        for (let j = 0; j < lines.length; j++) {
          if (used[j] || i === j) continue;
          // Try to connect end-to-start
          const end = chain[chain.length - 1];
          const start = chain[0];
          const candStart = lines[j][0];
          const candEnd = lines[j][lines[j].length - 1];
          // End of chain to start of candidate
          if (
            Math.abs(end[0] - candStart[0]) < tolerance &&
            Math.abs(end[1] - candStart[1]) < tolerance
          ) {
            chain = chain.concat(lines[j].slice(1));
            used[j] = true;
            extended = true;
            break;
          }
          // End of chain to end of candidate (reverse)
          if (
            Math.abs(end[0] - candEnd[0]) < tolerance &&
            Math.abs(end[1] - candEnd[1]) < tolerance
          ) {
            chain = chain.concat(lines[j].slice(0, -1).reverse());
            used[j] = true;
            extended = true;
            break;
          }
          // Start of chain to end of candidate (prepend)
          if (
            Math.abs(start[0] - candEnd[0]) < tolerance &&
            Math.abs(start[1] - candEnd[1]) < tolerance
          ) {
            chain = lines[j].slice(0, -1).reverse().concat(chain);
            used[j] = true;
            extended = true;
            break;
          }
          // Start of chain to start of candidate (prepend reversed)
          if (
            Math.abs(start[0] - candStart[0]) < tolerance &&
            Math.abs(start[1] - candStart[1]) < tolerance
          ) {
            chain = lines[j].slice(1).concat(chain);
            used[j] = true;
            extended = true;
            break;
          }
        }
      }
      // Check if closed (first == last)
      const isClosed =
        Math.abs(chain[0][0] - chain[chain.length - 1][0]) < tolerance &&
        Math.abs(chain[0][1] - chain[chain.length - 1][1]) < tolerance;
      if (isClosed && chain.length >= 4) {
        mergedFeatures.push({
          type: 'Feature',
          properties: { level: Number(level), merged: true, closed: true },
          geometry: { type: 'Polygon', coordinates: [chain] }
        });
      } else {
        mergedFeatures.push({
          type: 'Feature',
          properties: { level: Number(level), merged: true, closed: false },
          geometry: { type: 'LineString', coordinates: chain }
        });
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features: mergedFeatures
  };
}




module.exports = {
    createTiledBuilder,
    generateTiledIsolines,
    extractTileFromGrid,
    ALGORITHMS
};
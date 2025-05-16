const Conrec = require('./conrec');
const IsolineBuilder = require('./isolineBuilder');
const SpatialIndex = require('./spatialIndex');
const TiledIsolineBuilder = require('./tiledIsolineBuilder');

/**
 * Generate isolines from an array of values and convert to GeoJSON
 * @param {number[]} values - Array of values to generate isolines for
 * @param {Object} options - Configuration options
 * @param {number} [options.width] - Width of the grid (optional, defaults to square grid)
 * @param {number} [options.height] - Height of the grid (optional)
 * @param {number} [options.tileSize] - Size of tiles for large datasets (optional, default 128)
 * @param {boolean} [options.forceTiled] - Force using tiled processing even for small datasets
 * @param {number[]} [options.levels] - Custom contour levels (optional)
 * @returns {Object} - GeoJSON FeatureCollection
 */
function generateIsolinesFromValues(values, options = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Values must be a non-empty array of numbers');
  }
  
  const width = options.width || Math.ceil(Math.sqrt(values.length));
  
  const height = options.height || Math.ceil(values.length / width);
  
  const tileSize = options.tileSize || 128;
  
  const useTiled = options.forceTiled || (values.length > tileSize * tileSize);
  
  if (useTiled) {
    console.log(`Using tiled processing for dataset (${width}x${height})`);
    return generateIsolinesFromValuesTiled(values, width, height, options);
  }
  
  const grid = [];
  for (let i = 0; i < height; i++) {
    const row = [];
    for (let j = 0; j < width; j++) {
      const index = i * width + j;
      row.push(index < values.length ? values[index] : 0);
    }
    grid.push(row);
  }
  
  const levels = options.levels || [...new Set(values)].sort((a, b) => a - b);
  
  return generateIsolines(grid, levels);
}

/**
 * Generate isolines from a large array of values using tiled processing
 * @private
 */
function generateIsolinesFromValuesTiled(values, width, height, options = {}) {
  const tileSize = options.tileSize || 128;
  
  let levels;
  if (options.levels && options.levels.length > 0) {
    levels = options.levels;
  } else {
    const min = Math.min(...values.filter(v => !isNaN(v)));
    const max = Math.max(...values.filter(v => !isNaN(v)));
    const step = (max - min) / 10;
    levels = Array.from({ length: 10 }, (_, i) => min + (i + 0.5) * step);
  }
  
  const builder = new TiledIsolineBuilder(levels, tileSize);
  
  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);
  
  console.log(`Grid will be split into ${tilesX}x${tilesY} tiles`);
  
  for (let tileY = 0; tileY < tilesY; tileY++) {
    for (let tileX = 0; tileX < tilesX; tileX++) {
      const tileData = extractTile(values, width, height, tileX, tileY, tileSize);
      
      builder.addTile(tileY, tileX, tileData);
    }
  }
  
  return builder.getIsolinesAsGeoJSON();
}

/**
 * Extract a tile from a large array
 * @private
 */
function extractTile(values, width, height, tileX, tileY, tileSize) {
  const tileData = [];
  
  const startY = tileY * tileSize;
  const endY = Math.min(startY + tileSize, height);
  const startX = tileX * tileSize;
  const endX = Math.min(startX + tileSize, width);
  
  for (let y = startY; y < endY; y++) {
    const row = [];
    for (let x = startX; x < endX; x++) {
      const index = y * width + x;
      row.push(index < values.length ? values[index] : 0);
    }
    tileData.push(row);
  }
  
  return tileData;
}

/**
 * Generate isolines from a grid of values and convert to GeoJSON
 * @param {number[][]} grid - 2D array of values
 * @param {number[]} levels - Array of contour levels to generate
 * @returns {Object} - GeoJSON FeatureCollection
 */
function generateIsolines(grid, levels) {
  if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0])) {
    throw new Error('Invalid grid: must be a non-empty 2D array');
  }
  
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new Error('Invalid levels: must be a non-empty array of numbers');
  }
  
  const conrec = new Conrec();
  const segments = conrec.computeSegments(grid, levels);
  
  const gridResolution = 1; // Default value
  
  const builder = new IsolineBuilder();
  const isolines = builder.buildIsolines(segments, gridResolution);
  
  return isolinesToGeoJSON(isolines);
}

/**
 * Convert isolines to GeoJSON format
 * @param {Array<Array<Point>>} isolines - Array of isolines
 * @returns {Object} - GeoJSON FeatureCollection
 */
function isolinesToGeoJSON(isolines) {
  const features = isolines.map(isoline => {
    const coordinates = isoline.map(point => [point.lon, point.lat]);
    
    if (!isPolygonClosed(coordinates)) {
      coordinates.push([...coordinates[0]]);
    }
    
    return {
      type: 'Feature',
      properties: {
        level: isoline.level
      },
      geometry: {
        type: 'Polygon',
        coordinates: [coordinates]
      }
    };
  });
  
  return {
    type: 'FeatureCollection',
    features: features
  };
}

/**
 * Check if a polygon is closed
 * @private
 */
function isPolygonClosed(coordinates) {
  if (coordinates.length < 2) return false;
  
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  
  return first[0] === last[0] && first[1] === last[1];
}

module.exports = {
  generateIsolinesFromValues,
  generateIsolines,
  Conrec,
  IsolineBuilder,
  SpatialIndex,
  TiledIsolineBuilder
};

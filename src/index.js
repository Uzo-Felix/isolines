const Conrec = require('./conrec');
const IsolineBuilder = require('./isolineBuilder');
const SpatialIndex = require('./spatialIndex');

/**
 * Generate isolines from an array of values and convert to GeoJSON
 * @param {number[]} values - Array of values to generate isolines for
 * @param {Object} options - Configuration options
 * @param {number} [options.width] - Width of the grid (optional, defaults to square grid)
 * @param {number} [options.height] - Height of the grid (optional)
 * @returns {Object} - GeoJSON FeatureCollection
 */
function generateIsolinesFromValues(values, options = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Values must be a non-empty array of numbers');
  }
  
  // If width is not provided, assume a square grid
  const width = options.width || Math.ceil(Math.sqrt(values.length));
  
  // If height is not provided, calculate based on width and array length
  const height = options.height || Math.ceil(values.length / width);
  
  // Convert 1D array to 2D grid
  const grid = [];
  for (let i = 0; i < height; i++) {
    const row = [];
    for (let j = 0; j < width; j++) {
      const index = i * width + j;
      row.push(index < values.length ? values[index] : 0);
    }
    grid.push(row);
  }
  
  // Create contour levels - use the unique values from the input array
  const levels = [...new Set(values)].sort((a, b) => a - b);
  
  // Generate isolines
  return generateIsolines(grid, levels);
}

/**
 * Generate isolines from a grid of values and convert to GeoJSON
 * @param {number[][]} grid - 2D array of values
 * @param {number[]} levels - Array of contour levels to generate
 * @returns {Object} - GeoJSON FeatureCollection
 */
function generateIsolines(grid, levels) {
  // Validate input
  if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0])) {
    throw new Error('Invalid grid: must be a non-empty 2D array');
  }
  
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new Error('Invalid levels: must be a non-empty array of numbers');
  }
  
  // Generate contour segments
  const conrec = new Conrec();
  const segments = conrec.computeSegments(grid, levels);
  
  // Calculate grid resolution based on data dimensions
  const gridResolution = 1; // Default value
  
  // Build isolines from segments
  const builder = new IsolineBuilder();
  const isolines = builder.buildIsolines(segments, gridResolution);
  
  // Convert isolines to GeoJSON
  return isolinesToGeoJSON(isolines);
}

/**
 * Convert isolines to GeoJSON format
 * @param {Array<Array<Point>>} isolines - Array of isolines
 * @returns {Object} - GeoJSON FeatureCollection
 */
function isolinesToGeoJSON(isolines) {
  const features = isolines.map(isoline => {
    // Convert to GeoJSON coordinates format [lon, lat]
    const coordinates = isoline.map(point => [point.lon, point.lat]);
    
    // Ensure the polygon is closed
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
  SpatialIndex
};

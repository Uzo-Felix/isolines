/**
 * Tiled Algorithm Selector
 * Integrates with existing visualization tools
 */
const LineStringBasedTiledBuilder = require('./linestring-based');
const PolygonBasedTiledBuilder = require('./polygon-based');
const StripBasedTiledBuilder = require('./strip-based');

const ALGORITHMS = {
    LINESTRING: 'linestring',
    POLYGON: 'polygon',
    STRIP: 'strip'
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
    const algorithm = options.algorithm || ALGORITHMS.LINESTRING;
    const tileSize = options.tileSize || 64;
    
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

module.exports = {
    createTiledBuilder,
    generateTiledIsolines,
    extractTileFromGrid,
    ALGORITHMS
};

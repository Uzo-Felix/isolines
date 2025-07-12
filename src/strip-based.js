/**
 * Strip-Based Tiled Isoline Builder
 * Uses data-level merging with boundary strips for mathematical continuity
 */
const IsolineBuilder = require('./isolineBuilder');
const Conrec = require('./conrec');

class TiledIsolineBuilder {
    constructor(levels = [], tileSize = 128) {
        this.levels = levels;
        this.tileSize = tileSize;
        
        // Core data storage
        this.tiles = new Map();           // Original tiles (kept for other GIS operations)
        this.dataStrips = new Map();      // Boundary data strips only
        
        // Processing components
        this.conrec = new Conrec();
        this.builder = new IsolineBuilder();
        this.EPSILON = 0.000001;
        this.STRIP_WIDTH = 2;             // 2 rows/columns for boundary strips
    }

    /**
     * Add a new tile and process with strip-based algorithm
     */
    addTile(i, j, tileData) {
        if (!tileData || tileData.length === 0) {
            throw new Error('Empty tile data');
        }

        // Validate tile data
        const expectedWidth = tileData[0].length;
        if (tileData.some(row => row.length !== expectedWidth)) {
            throw new Error('Inconsistent tile row lengths');
        }

        // Clean NaN values
        if (tileData.some(row => row.some(val => isNaN(val)))) {
            console.warn(`Tile (${i},${j}) contains NaN values, converting to 0`);
            tileData = tileData.map(row => row.map(val => isNaN(val) ? 0 : val));
        }

        const tileKey = `${i},${j}`;
        
        // Store tile (needed for other GIS operations per professor's note)
        this.tiles.set(tileKey, tileData);
        
        // Extract and store data strips for neighbors
        this.extractDataStrips(i, j, tileData);
        
        // Process this tile with available strips
        return this.processTileWithStrips(i, j, tileData);
    }

    /**
     * Extract boundary data strips for neighbor tiles
     * Stores raw data values, not geometric objects
     */
    extractDataStrips(i, j, tileData) {
        const height = tileData.length;
        const width = tileData[0].length;
        
        // Extract boundary strips (raw data values)
        const strips = {
            top: tileData.slice(0, this.STRIP_WIDTH),                    // First 2 rows
            bottom: tileData.slice(-this.STRIP_WIDTH),                   // Last 2 rows
            left: tileData.map(row => row.slice(0, this.STRIP_WIDTH)),   // First 2 columns  
            right: tileData.map(row => row.slice(-this.STRIP_WIDTH))     // Last 2 columns
        };
        
        // Store strips with neighbor tile keys for retrieval
        // Top strip goes to tile above (i-1, j)
        this.dataStrips.set(`bottom_strip:${i-1}:${j}`, strips.top);
        
        // Bottom strip goes to tile below (i+1, j)  
        this.dataStrips.set(`top_strip:${i+1}:${j}`, strips.bottom);
        
        // Left strip goes to tile left (i, j-1)
        this.dataStrips.set(`right_strip:${i}:${j-1}`, strips.left);
        
        // Right strip goes to tile right (i, j+1)
        this.dataStrips.set(`left_strip:${i}:${j+1}`, strips.right);
        
        console.log(`Extracted strips for tile (${i},${j}): ${Object.keys(strips).length} boundaries`);
    }

}

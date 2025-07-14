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

    /**
     * Create expanded tile by attaching available boundary strips
     * This ensures mathematical continuity across tile boundaries
     */
    createExpandedTile(i, j, tileData) {
        // Start with original tile data
        let expandedData = tileData.map(row => [...row]);
        
        // Get available strips from neighbors
        const topStrip = this.dataStrips.get(`top_strip:${i}:${j}`);
        const bottomStrip = this.dataStrips.get(`bottom_strip:${i}:${j}`);
        const leftStrip = this.dataStrips.get(`left_strip:${i}:${j}`);
        const rightStrip = this.dataStrips.get(`right_strip:${i}:${j}`);
        
        // Attach top strip (prepend rows)
        if (topStrip) {
            expandedData = [...topStrip, ...expandedData];
            console.log(`Attached top strip to tile (${i},${j})`);
        }
        
        // Attach bottom strip (append rows)
        if (bottomStrip) {
            expandedData = [...expandedData, ...bottomStrip];
            console.log(`Attached bottom strip to tile (${i},${j})`);
        }
        
        // Attach left strip (prepend columns to each row)
        if (leftStrip) {
            expandedData = expandedData.map((row, rowIndex) => {
                const leftCols = leftStrip[rowIndex] || [];
                return [...leftCols, ...row];
            });
            console.log(`Attached left strip to tile (${i},${j})`);
        }
        
        // Attach right strip (append columns to each row)
        if (rightStrip) {
            expandedData = expandedData.map((row, rowIndex) => {
                const rightCols = rightStrip[rowIndex] || [];
                return [...row, ...rightCols];
            });
            console.log(`Attached right strip to tile (${i},${j})`);
        }
        
        console.log(`Expanded tile (${i},${j}): ${tileData.length}x${tileData[0].length} → ${expandedData.length}x${expandedData[0].length}`);
        
        return expandedData;
    }

    /**
     * Process tile using strip-based algorithm
     * 1. Create expanded tile with strips
     * 2. Generate LineStrings from expanded data  
     * 3. Process each level independently (parallelizable)
     */
    processTileWithStrips(i, j, tileData) {
        // Step 1: Create expanded tile with attached strips
        const expandedData = this.createExpandedTile(i, j, tileData);
        
        // Step 2: Process each level independently
        const allLineStrings = [];
        
        for (const level of this.levels) {
            // Generate contour segments from expanded data
            const segments = this.conrec.computeSegments(expandedData, [level]);
            
            // Build LineStrings from segments
            const lineStrings = this.builder.buildLineStrings(segments, 1);
            
            // Transform coordinates to global space
            const transformedLineStrings = this.transformToGlobalCoordinates(lineStrings, i, j, level);
            
            allLineStrings.push(...transformedLineStrings);
        }
        
        console.log(`Generated ${allLineStrings.length} LineStrings for tile (${i},${j})`);
        
        // Step 3: Return as GeoJSON
        return this.lineStringsToGeoJSON(allLineStrings);
    }

    /**
     * Transform LineString coordinates to global coordinate system
     * Simple translation - no complex transformations needed
     */
    transformToGlobalCoordinates(lineStrings, tileI, tileJ, level) {
        return lineStrings.map(lineString => {
            const transformedPoints = lineString.map(point => ({
                lat: point.lat + (tileI * this.tileSize),
                lon: point.lon + (tileJ * this.tileSize)
            }));
            
            // Preserve level and closure information
            transformedPoints.level = level;
            transformedPoints.isClosed = this.isLineStringClosed(transformedPoints);
            
            return transformedPoints;
        });
    }
    
    /**
     * Check if LineString forms a closed loop
     */
    isLineStringClosed(lineString) {
        if (lineString.length < 3) return false;
        
        const first = lineString[0];
        const last = lineString[lineString.length - 1];
        
        return this.distance(first, last) < this.EPSILON;
    }
    
    /**
     * Calculate distance between two points
     */
    distance(p1, p2) {
        const dx = p1.lon - p2.lon;
        const dy = p1.lat - p2.lat;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Convert LineStrings to GeoJSON format
     * Closed LineStrings become Polygons, open ones remain LineStrings
     */
    lineStringsToGeoJSON(lineStrings) {
        const features = lineStrings.map(lineString => {
            const coordinates = lineString.map(point => [point.lon, point.lat]);
            
            // Check if LineString should be converted to Polygon
            const isClosed = lineString.isClosed || this.isLineStringClosed(lineString);
            
            if (isClosed && coordinates.length >= 4) {
                // Ensure polygon is properly closed
                if (!this.isPolygonClosed(coordinates)) {
                    coordinates.push([...coordinates[0]]);
                }
                
                return {
                    type: 'Feature',
                    properties: {
                        level: lineString.level,
                        type: 'closed_contour'
                    },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [coordinates]
                    }
                };
            } else {
                // Keep as LineString
                return {
                    type: 'Feature',
                    properties: {
                        level: lineString.level,
                        type: 'open_contour'
                    },
                    geometry: {
                        type: 'LineString',
                        coordinates: coordinates
                    }
                };
            }
        });
        
        return {
            type: 'FeatureCollection',
            features: features
        };
    }
    
    /**
     * Check if polygon coordinates are closed
     */
    isPolygonClosed(coordinates) {
        if (coordinates.length < 2) return false;
        
        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];
        
        return first[0] === last[0] && first[1] === last[1];
    }


}

module.exports = TiledIsolineBuilder;
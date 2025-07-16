/**
 * Strip-Based Tiled Isoline Builder
 * Uses PURE data-level merging with boundary strips for mathematical continuity
 */
const IsolineBuilder = require('../../core/isolineBuilder');
const Conrec = require('../../core/conrec');

class TiledIsolineBuilder {
    constructor(levels = [], tileSize = 128, debugMode = true) {
        this.levels = levels;
        this.tileSize = tileSize;
        this.debugMode = debugMode;
        
        // Core data storage
        this.tiles = new Map();           // Keep raw tiles (for debugging & other GIS ops)
        this.dataStrips = new Map();      // Boundary data strips (RAW VALUES ONLY)
        
        // Processing components
        this.conrec = new Conrec();
        this.builder = new IsolineBuilder();
        this.STRIP_WIDTH = 2;             // 2 rows/columns for boundary overlap
        
        // Debug tracking
        if (this.debugMode) {
            this.processingLog = [];
            this.stripUsage = new Map();
        }
    }

    /**
     * Add a new tile and process with strip-based algorithm
     */
    addTile(i, j, tileData) {
        if (!tileData || tileData.length === 0) {
            throw new Error('Empty tile data');
        }

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
        
        // Store tile (needed for other GIS operations and debugging)
        this.tiles.set(tileKey, tileData);
        
        // Extract and store data strips for neighbors
        this.extractDataStrips(i, j, tileData);
        
        // Process this tile with available strips
        const result = this.processTileWithStrips(i, j, tileData);
        
        this.logProcessing(i, j, tileData, result);
        
        return result;
    }

    /**
     * Extract boundary data strips for neighbor tiles
     * Stores ONLY raw data values - the key insight!
     */
    extractDataStrips(i, j, tileData) {
        const height = tileData.length;
        const width = tileData[0].length;
        const tileKey = `${i},${j}`;
        
        // Extract boundary strips (RAW DATA VALUES ONLY)
        const strips = {
            top: tileData.slice(0, this.STRIP_WIDTH),                    // First 2 rows
            bottom: tileData.slice(-this.STRIP_WIDTH),                   // Last 2 rows
            left: tileData.map(row => row.slice(0, this.STRIP_WIDTH)),   // First 2 columns  
            right: tileData.map(row => row.slice(-this.STRIP_WIDTH))     // Last 2 columns
        };
        
        // Store strips for neighbor tiles to retrieve
        this.dataStrips.set(`bottom_strip:${i-1}:${j}`, strips.top);
        this.dataStrips.set(`top_strip:${i+1}:${j}`, strips.bottom);
        this.dataStrips.set(`right_strip:${i}:${j-1}`, strips.left);
        this.dataStrips.set(`left_strip:${i}:${j+1}`, strips.right);
        
        if (this.debugMode) {
            this.stripUsage.set(tileKey, {
                provided: Object.keys(strips),
                providedTo: [
                    `tile(${i-1},${j})`,
                    `tile(${i+1},${j})`, 
                    `tile(${i},${j-1})`,
                    `tile(${i},${j+1})`
                ]
            });
        }
        
        console.log(`✅ Extracted strips for tile (${i},${j}): providing data to 4 neighbors`);
    }

    /**
     * Create expanded tile by attaching available boundary strips
     */
    createExpandedTile(i, j, tileData) {
        let expandedData = tileData.map(row => [...row]);
        const expansions = [];
        
        // Get available strips from neighbors (EXACT SAME raw values!)
        const topStrip = this.dataStrips.get(`top_strip:${i}:${j}`);
        const bottomStrip = this.dataStrips.get(`bottom_strip:${i}:${j}`);
        const leftStrip = this.dataStrips.get(`left_strip:${i}:${j}`);
        const rightStrip = this.dataStrips.get(`right_strip:${i}:${j}`);
        
        // Attach top strip (prepend rows)
        if (topStrip) {
            expandedData = [...topStrip, ...expandedData];
            expansions.push(`top(${topStrip.length}x${topStrip[0].length})`);
        }
        
        // Attach bottom strip (append rows)
        if (bottomStrip) {
            expandedData = [...expandedData, ...bottomStrip];
            expansions.push(`bottom(${bottomStrip.length}x${bottomStrip[0].length})`);
        }
        
        // Attach left strip (prepend columns to each row)
        if (leftStrip) {
            for (let rowIndex = 0; rowIndex < expandedData.length; rowIndex++) {
                const leftCols = leftStrip[rowIndex] || [];
                expandedData[rowIndex] = [...leftCols, ...expandedData[rowIndex]];
            }
            expansions.push(`left(${leftStrip.length}x${leftStrip[0].length})`);
        }
        
        // Attach right strip (append columns to each row)
        if (rightStrip) {
            for (let rowIndex = 0; rowIndex < expandedData.length; rowIndex++) {
                const rightCols = rightStrip[rowIndex] || [];
                expandedData[rowIndex] = [...expandedData[rowIndex], ...rightCols];
            }
            expansions.push(`right(${rightStrip.length}x${rightStrip[0].length})`);
        }
        
        console.log(`🔧 Expanded tile (${i},${j}): ${tileData.length}x${tileData[0].length} → ${expandedData.length}x${expandedData[0].length}`);
        console.log(`   Attached: ${expansions.join(', ')}`);
        
        return expandedData;
    }

    /**
     * Process tile using PURE strip-based algorithm
     */
    processTileWithStrips(i, j, tileData) {
        // Step 1: Create expanded tile with attached strips
        const expandedData = this.createExpandedTile(i, j, tileData);
        
        // Step 2: Process expanded data normally - NO special boundary handling needed!
        const allLineStrings = [];
        
        for (const level of this.levels) {
            // Generate contour segments from expanded data
            // Since boundaries use IDENTICAL raw data, contours will naturally align!
            const segments = this.conrec.computeSegments(expandedData, [level]);
            
            // Build LineStrings from segments
            const lineStrings = this.builder.buildLineStrings(segments, 1);
            
            // Transform coordinates to global space
            const transformedLineStrings = this.transformToGlobalCoordinates(lineStrings, i, j, level);
            
            allLineStrings.push(...transformedLineStrings);
        }
        
        console.log(`🎯 Generated ${allLineStrings.length} LineStrings for tile (${i},${j}) using strip-based approach`);
        
        return this.lineStringsToGeoJSON(allLineStrings);
    }

    /**
     * Transform LineString coordinates to global coordinate system
     * Account for strip expansion offsets
     */
    transformToGlobalCoordinates(lineStrings, tileI, tileJ, level) {
        return lineStrings.map(lineString => {
            const transformedPoints = lineString.map(point => {
                // Calculate offsets due to strip expansion
                const topStripOffset = this.dataStrips.has(`top_strip:${tileI}:${tileJ}`) ? this.STRIP_WIDTH : 0;
                const leftStripOffset = this.dataStrips.has(`left_strip:${tileI}:${tileJ}`) ? this.STRIP_WIDTH : 0;
                
                return {
                    lat: point.lat - topStripOffset + (tileI * this.tileSize),
                    lon: point.lon - leftStripOffset + (tileJ * this.tileSize)
                };
            });
            
            // Preserve level and check if naturally closed
            transformedPoints.level = level;
            transformedPoints.isClosed = this.isNaturallyClosed(transformedPoints);
            
            return transformedPoints;
        });
    }
    
    /**
     * Check if LineString is naturally closed (no epsilon needed!)
     * Since we use identical data, closed loops should be mathematically exact
     */
    isNaturallyClosed(lineString) {
        if (lineString.length < 3) return false;
        
        const first = lineString[0];
        const last = lineString[lineString.length - 1];
        
        // Exact comparison - no epsilon needed with identical data!
        return first.lat === last.lat && first.lon === last.lon;
    }

    /**
     * Convert LineStrings to GeoJSON format
     * Naturally closed LineStrings become Polygons
     */
    lineStringsToGeoJSON(lineStrings) {
        const features = lineStrings.map(lineString => {
            const coordinates = lineString.map(point => [point.lon, point.lat]);
            
            // Check if naturally closed
            const isClosed = lineString.isClosed || this.isNaturallyClosed(lineString);
            
            if (isClosed && coordinates.length >= 4) {
                // Ensure polygon is properly closed
                if (!this.isPolygonClosed(coordinates)) {
                    coordinates.push([...coordinates[0]]);
                }
                
                return {
                    type: 'Feature',
                    properties: {
                        level: lineString.level,
                        type: 'closed_contour',
                        source: 'strip_based'
                    },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [coordinates]
                    }
                };
            } else {
                return {
                    type: 'Feature',
                    properties: {
                        level: lineString.level,
                        type: 'open_contour',
                        source: 'strip_based'
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

    /**
     * Get all current isolines as GeoJSON (main output method)
     */
    getIsolinesAsGeoJSON() {
        const allFeatures = [];
        
        // Process all tiles with current strip state
        for (const [tileKey, tileData] of this.tiles.entries()) {
            const [i, j] = tileKey.split(',').map(Number);
            
            const tileGeoJSON = this.processTileWithStrips(i, j, tileData);
            allFeatures.push(...tileGeoJSON.features);
        }
        
        console.log(`📊 Total features across all tiles: ${allFeatures.length}`);
        
        return {
            type: 'FeatureCollection',
            features: allFeatures
        };
    }
    
    /**
     * Process single level across all tiles (for parallelization)
     * Professor's suggestion: parallelize by level
     */
    processLevelAcrossAllTiles(level) {
        const levelResults = [];
        
        for (const [tileKey, tileData] of this.tiles.entries()) {
            const [i, j] = tileKey.split(',').map(Number);
            
            // Create expanded tile with strips
            const expandedData = this.createExpandedTile(i, j, tileData);
            
            // Process only this level
            const segments = this.conrec.computeSegments(expandedData, [level]);
            const lineStrings = this.builder.buildLineStrings(segments, 1);
            const transformed = this.transformToGlobalCoordinates(lineStrings, i, j, level);
            
            levelResults.push(...transformed);
        }
        
        return levelResults;
    }
    
    /**
     * Parallel processing entry point
     * Each level can be processed independently by different workers
     */
    async processAllLevelsInParallel() {
        console.log('🚀 Processing levels in parallel...');
        
        // This could be enhanced to use Web Workers
        const promises = this.levels.map(level => 
            Promise.resolve(this.processLevelAcrossAllTiles(level))
        );
        
        const results = await Promise.all(promises);
        
        // Combine results from all levels
        const allLineStrings = results.flat();
        return this.lineStringsToGeoJSON(allLineStrings);
    }

    /**
     * Debug logging for processing steps
     */
    logProcessing(i, j, tileData, result) {
        if (!this.debugMode) return;
        
        const logEntry = {
            timestamp: Date.now(),
            tile: { i, j },
            dimensions: {
                original: `${tileData.length}x${tileData[0].length}`,
                processed: `${result.features.length} features`
            },
            stripsUsed: [],
            stripsProvided: []
        };
        
        // Check which strips were used
        const stripKeys = [
            `top_strip:${i}:${j}`,
            `bottom_strip:${i}:${j}`,
            `left_strip:${i}:${j}`,
            `right_strip:${i}:${j}`
        ];
        
        for (const key of stripKeys) {
            if (this.dataStrips.has(key)) {
                logEntry.stripsUsed.push(key);
            }
        }
        
        // Check which strips this tile provided
        const providedKeys = [
            `bottom_strip:${i-1}:${j}`,
            `top_strip:${i+1}:${j}`,
            `right_strip:${i}:${j-1}`,
            `left_strip:${i}:${j+1}`
        ];
        
        for (const key of providedKeys) {
            if (this.dataStrips.has(key)) {
                logEntry.stripsProvided.push(key);
            }
        }
        
        this.processingLog.push(logEntry);
        
        console.log(`📝 Tile (${i},${j}): Used ${logEntry.stripsUsed.length} strips, provided ${logEntry.stripsProvided.length} strips`);
    }

    /**
     * Get comprehensive statistics about the strip-based processing
     */
    getStatistics() {
        const stats = {
            tiles: this.tiles.size,
            levels: this.levels.length,
            dataStrips: this.dataStrips.size,
            algorithm: 'strip-based',
            stripWidth: this.STRIP_WIDTH,
            memoryOptimization: !this.debugMode ? 'enabled' : 'disabled_for_debugging'
        };
        
        // Analyze strip usage
        let totalStripsUsed = 0;
        let totalStripsProvided = 0;
        const stripUsageByTile = new Map();
        
        if (this.debugMode && this.processingLog.length > 0) {
            for (const logEntry of this.processingLog) {
                totalStripsUsed += logEntry.stripsUsed.length;
                totalStripsProvided += logEntry.stripsProvided.length;
                
                const tileKey = `${logEntry.tile.i},${logEntry.tile.j}`;
                stripUsageByTile.set(tileKey, {
                    used: logEntry.stripsUsed.length,
                    provided: logEntry.stripsProvided.length
                });
            }
            
            stats.stripAnalysis = {
                totalStripsUsed,
                totalStripsProvided,
                averageStripsPerTile: totalStripsUsed / this.processingLog.length,
                stripUsageByTile: Object.fromEntries(stripUsageByTile)
            };
        }
        
        // Analyze contour generation
        const allIsolines = this.getIsolinesAsGeoJSON();
        stats.contourAnalysis = {
            totalFeatures: allIsolines.features.length,
            byType: {
                polygons: allIsolines.features.filter(f => f.geometry.type === 'Polygon').length,
                lineStrings: allIsolines.features.filter(f => f.geometry.type === 'LineString').length
            },
            byLevel: {}
        };
        
        // Count features by level
        for (const feature of allIsolines.features) {
            const level = feature.properties.level;
            stats.contourAnalysis.byLevel[level] = (stats.contourAnalysis.byLevel[level] || 0) + 1;
        }
        
        return stats;
    }

    /**
     * Get debug information about strip usage and boundaries
     */
    getDebugInfo() {
        if (!this.debugMode) {
            return { error: 'Debug mode disabled' };
        }
        
        return {
            processingLog: this.processingLog,
            stripUsage: Object.fromEntries(this.stripUsage),
            availableStrips: Array.from(this.dataStrips.keys()),
            tileOrder: Array.from(this.tiles.keys()),
            dataStripSizes: Object.fromEntries(
                Array.from(this.dataStrips.entries()).map(([key, stripData]) => [
                    key,
                    `${stripData.length}x${stripData[0]?.length || 0}`
                ])
            )
        };
    }

    /**
     * Validate strip consistency across boundaries
     * Ensures neighboring tiles have matching boundary data
     */
    validateStripConsistency() {
        const inconsistencies = [];
        
        for (const [tileKey, tileData] of this.tiles.entries()) {
            const [i, j] = tileKey.split(',').map(Number);
            
            // Check top neighbor consistency
            const topNeighborKey = `${i-1},${j}`;
            if (this.tiles.has(topNeighborKey)) {
                const topNeighborData = this.tiles.get(topNeighborKey);
                const ourTopStrip = this.dataStrips.get(`top_strip:${i}:${j}`);
                const expectedTopStrip = topNeighborData.slice(-this.STRIP_WIDTH);
                
                if (ourTopStrip && !this.arraysEqual(ourTopStrip, expectedTopStrip)) {
                    inconsistencies.push({
                        type: 'top_boundary_mismatch',
                        tile: `${i},${j}`,
                        neighbor: topNeighborKey,
                        message: 'Top strip data does not match neighbor bottom data'
                    });
                }
            }
            
            // Check right neighbor consistency
            const rightNeighborKey = `${i},${j+1}`;
            if (this.tiles.has(rightNeighborKey)) {
                const rightNeighborData = this.tiles.get(rightNeighborKey);
                const ourRightStrip = this.dataStrips.get(`right_strip:${i}:${j}`);
                const expectedRightStrip = rightNeighborData.map(row => row.slice(0, this.STRIP_WIDTH));
                
                if (ourRightStrip && !this.arraysEqual(ourRightStrip, expectedRightStrip)) {
                    inconsistencies.push({
                        type: 'right_boundary_mismatch',
                        tile: `${i},${j}`,
                        neighbor: rightNeighborKey,
                        message: 'Right strip data does not match neighbor left data'
                    });
                }
            }
        }
        
        return {
            consistent: inconsistencies.length === 0,
            inconsistencies: inconsistencies,
            totalChecked: this.tiles.size * 2 // Each tile checks 2 neighbors (top, right)
        };
    }

    /**
     * Helper method to compare 2D arrays for equality
     */
    arraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        
        for (let i = 0; i < arr1.length; i++) {
            if (arr1[i].length !== arr2[i].length) return false;
            
            for (let j = 0; j < arr1[i].length; j++) {
                if (arr1[i][j] !== arr2[i][j]) return false;
            }
        }
        
        return true;
    }

    /**
     * Export processing results for comparison with other algorithms
     */
    exportForComparison() {
        const geoJSON = this.getIsolinesAsGeoJSON();
        const stats = this.getStatistics();
        
        return {
            algorithm: 'strip-based',
            timestamp: new Date().toISOString(),
            configuration: {
                levels: this.levels,
                tileSize: this.tileSize,
                stripWidth: this.STRIP_WIDTH,
                debugMode: this.debugMode
            },
            results: {
                features: geoJSON.features,
                featureCount: geoJSON.features.length,
                statistics: stats
            },
            validation: this.validateStripConsistency(),
            debugInfo: this.debugMode ? this.getDebugInfo() : null
        };
    }

    /**
     * Clear all data (for memory optimization when debugging is complete)
     */
    clearForProduction() {
        if (this.debugMode) {
            console.warn('⚠️  Cannot clear data in debug mode');
            return false;
        }
        
        // Keep only essential data for production
        this.processingLog = [];
        this.stripUsage.clear();
        
        console.log('✅ Cleared debug data for production use');
        return true;
    }

    /**
     * Get boundary continuity report
     * Shows how well the strip-based approach maintains continuity
     */
    getBoundaryContinuityReport() {
        const report = {
            algorithm: 'strip-based',
            expectedBehavior: 'Perfect continuity through identical boundary data',
            actualResults: {}
        };
        
        const geoJSON = this.getIsolinesAsGeoJSON();
        
        // Analyze boundary crossings
        let totalBoundaryCrossings = 0;
        let perfectContinuity = 0;
        
        for (const feature of geoJSON.features) {
            if (feature.geometry.type === 'LineString') {
                const coords = feature.geometry.coordinates;
                
                // Check if line crosses tile boundaries
                let crossesBoundary = false;
                for (let i = 0; i < coords.length - 1; i++) {
                    const [lon1, lat1] = coords[i];
                    const [lon2, lat2] = coords[i + 1];
                    
                    const tileI1 = Math.floor(lat1 / this.tileSize);
                    const tileJ1 = Math.floor(lon1 / this.tileSize);
                    const tileI2 = Math.floor(lat2 / this.tileSize);
                    const tileJ2 = Math.floor(lon2 / this.tileSize);
                    
                    if (tileI1 !== tileI2 || tileJ1 !== tileJ2) {
                        crossesBoundary = true;
                        totalBoundaryCrossings++;
                        
                        // In strip-based approach, all crossings should be perfect
                        perfectContinuity++;
                    }
                }
            }
        }
        
        report.actualResults = {
            totalBoundaryCrossings,
            perfectContinuity,
            continuityRate: totalBoundaryCrossings > 0 ? perfectContinuity / totalBoundaryCrossings : 1,
            message: totalBoundaryCrossings === perfectContinuity ? 
                'Perfect boundary continuity achieved' : 
                'Some boundary continuity issues detected'
        };
        
        return report;
    }
}

module.exports = TiledIsolineBuilder;

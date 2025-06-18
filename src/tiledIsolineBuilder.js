/**
 * Handles incremental isoline generation from tiled grid data
 * Builds and merges isolines as new tiles arrive
 * Now uses LineString approach with boundary strips and overlaps detection
 */
const IsolineBuilder = require('./isolineBuilder');
const Conrec = require('./conrec');
const SpatialIndex = require('./spatialIndex');

class TiledIsolineBuilder {
    constructor(levels = [], tileSize = 128, options = {}) {
        this.levels = levels;
        this.tileSize = tileSize;
        this.tiles = new Map(); 
        this.tileLineStrings = new Map();
        this.boundaryStrips = new Map(); // Store boundary strips
        this.mergedLineStrings = new Map();
        this.conrec = new Conrec();
        this.builder = new IsolineBuilder();
        this.EPSILON = options.epsilon || 0.000001;
        this.STRIP_WIDTH = options.stripWidth || 2;
        this.BOUNDARY_TOLERANCE = options.boundaryTolerance || Math.max(this.STRIP_WIDTH, this.EPSILON * 100);
        this.debug = options.debug || false;
        
        // Statistics for debugging
        this.stats = {
            tilesProcessed: 0,
            mergeAttempts: 0,
            successfulMerges: 0,
            boundaryConnections: 0
        };
    }

    /**
     * Add a new tile of data and update isolines
     * @param {number} i - Tile row index
     * @param {number} j - Tile column index
     * @param {number[][]} tileData - 2D grid of values for this tile
     * @returns {Object} - Updated isolines as GeoJSON
     */
    addTile(i, j, tileData) {
        if (this.debug) {
            console.log(`\n=== Processing tile (${i},${j}) ===`);
        }

        if (!tileData || tileData.length === 0) {
            throw new Error('Empty tile data');
        }

        const expectedWidth = tileData[0].length;
        if (tileData.some(row => row.length !== expectedWidth)) {
            throw new Error('Inconsistent tile row lengths');
        }

        if (tileData.length > this.tileSize * 2 || expectedWidth > this.tileSize * 2) {
            console.warn(`Tile (${i},${j}) exceeds expected dimensions: ${tileData.length}x${expectedWidth}`);
        }

        // Clean NaN values
        if (tileData.some(row => row.some(val => isNaN(val)))) {
            console.warn(`Tile (${i},${j}) contains NaN values which will be treated as 0`);
            tileData = tileData.map(row => row.map(val => isNaN(val) ? 0 : val));
        }

        const tileKey = `${i},${j}`;
        this.tiles.set(tileKey, tileData);

        // Process tile to generate LineStrings with improved coordinate handling
        const tileLineStrings = this.processTileWithSnapping(i, j, tileData);
        this.tileLineStrings.set(tileKey, tileLineStrings);

        // Extract and store boundary strips with better detection
        this.extractBoundaryStripsRobust(i, j, tileLineStrings);

        // Merge with neighboring tiles using improved logic
        this.mergeWithNeighborsImproved(i, j);

        this.stats.tilesProcessed++;

        if (this.debug) {
            this.debugTileProcessing(i, j, tileLineStrings);
        }

        return this.getIsolinesAsGeoJSON();
    }

    /**
     * Process a single tile with coordinate snapping for boundary consistency
     * @private
     */
    processTileWithSnapping(i, j, tileData) {
        const tileLineStrings = new Map();

        if (this.debug) {
            console.log(`Processing tile (${i},${j}) with ${tileData.length}x${tileData[0].length} data`);
        }

        for (const level of this.levels) {
            const segments = this.conrec.computeSegments(tileData, [level]);

            if (this.debug) {
                console.log(`Level ${level}: Generated ${segments.length} segments`);
            }

            // Use buildLineStrings instead of buildIsolines to get open LineStrings
            const lineStrings = this.builder.buildLineStrings(segments, 1);

            const transformedLineStrings = lineStrings.map(lineString => {
                // Transform coordinates with boundary snapping
                const transformedPoints = lineString.map(point => {
                    let lat = point.lat + (i * this.tileSize);
                    let lon = point.lon + (j * this.tileSize);
                    
                    // Snap to tile boundaries if very close (FIXED COORDINATE ALIGNMENT)
                    const tileStartLat = i * this.tileSize;
                    const tileEndLat = (i + 1) * this.tileSize;
                    const tileStartLon = j * this.tileSize;
                    const tileEndLon = (j + 1) * this.tileSize;
                    
                    if (Math.abs(lat - tileStartLat) < this.EPSILON) lat = tileStartLat;
                    if (Math.abs(lat - tileEndLat) < this.EPSILON) lat = tileEndLat;
                    if (Math.abs(lon - tileStartLon) < this.EPSILON) lon = tileStartLon;
                    if (Math.abs(lon - tileEndLon) < this.EPSILON) lon = tileEndLon;
                    
                    return {
                        lat: lat,
                        lon: lon,
                        level: lineString.level
                    };
                });

                transformedPoints.level = lineString.level;
                transformedPoints.isClosed = this.isLineStringClosed(transformedPoints);
                transformedPoints.tileOrigin = { i, j };

                return transformedPoints;
            });

            tileLineStrings.set(level, transformedLineStrings);

            if (this.debug) {
                console.log(`Level ${level}: Created ${transformedLineStrings.length} linestrings`);
                transformedLineStrings.forEach((ls, idx) => {
                    console.log(`  LineString ${idx}: ${ls.length} points, closed: ${ls.isClosed}`);
                });
            }
        }

        return tileLineStrings;
    }

    /**
     * Extract boundary strips with robust detection
     * @private
     */
    extractBoundaryStripsRobust(i, j, tileLineStrings) {
        const tileKey = `${i},${j}`;
        
        if (this.debug) {
            console.log(`Extracting boundary strips for tile (${i},${j})`);
        }
        
        for (const [level, lineStrings] of tileLineStrings.entries()) {
            const strips = this.getStripsForLevel(level);
            
            for (const lineString of lineStrings) {
                // Check if LineString intersects tile boundaries with improved detection
                const boundaryIntersections = this.getBoundaryIntersectionsRobust(i, j, lineString);
                
                if (boundaryIntersections.length > 0) {
                    if (this.debug) {
                        console.log(`LineString crosses boundaries: ${boundaryIntersections.join(', ')}`);
                    }
                    
                    // Store strips for each boundary this LineString crosses
                    for (const boundary of boundaryIntersections) {
                        const stripKey = this.getStripKey(i, j, boundary);
                        
                        if (!strips.has(stripKey)) {
                            strips.set(stripKey, []);
                        }
                        
                        strips.get(stripKey).push({
                            lineString: lineString,
                            tileKey: tileKey,
                            boundary: boundary,
                            endpoints: this.getLineStringEndpoints(lineString)
                        });
                    }
                }
            }
        }
    }

    /**
     * Get boundary intersections with robust tolerance
     * @private
     */
    getBoundaryIntersectionsRobust(i, j, lineString) {
        const boundaries = [];
        const tileStartLat = i * this.tileSize;
        const tileEndLat = (i + 1) * this.tileSize;
        const tileStartLon = j * this.tileSize;
        const tileEndLon = (j + 1) * this.tileSize;

        // Use configurable tolerance for boundary detection (FIXED BOUNDARY DETECTION)
        const tolerance = this.BOUNDARY_TOLERANCE;

        for (const point of lineString) {
            // Check if point is near tile boundaries with proper tolerance
            if (Math.abs(point.lat - tileStartLat) <= tolerance) {
                if (!boundaries.includes('top')) boundaries.push('top');
            }
            if (Math.abs(point.lat - tileEndLat) <= tolerance) {
                if (!boundaries.includes('bottom')) boundaries.push('bottom');
            }
            if (Math.abs(point.lon - tileStartLon) <= tolerance) {
                if (!boundaries.includes('left')) boundaries.push('left');
            }
            if (Math.abs(point.lon - tileEndLon) <= tolerance) {
                if (!boundaries.includes('right')) boundaries.push('right');
            }
        }

        return boundaries;
    }

    /**
     * Get line string endpoints for connection analysis
     * @private
     */
    getLineStringEndpoints(lineString) {
        if (lineString.length < 2) return [];
        
        return {
            start: lineString[0],
            end: lineString[lineString.length - 1],
            isClosed: this.isLineStringClosed(lineString)
        };
    }

    /**
     * Get strips map for a specific level
     * @private
     */
    getStripsForLevel(level) {
        if (!this.boundaryStrips.has(level)) {
            this.boundaryStrips.set(level, new Map());
        }
        return this.boundaryStrips.get(level);
    }

    /**
     * Generate strip key for boundary
     * @private
     */
    getStripKey(i, j, boundary) {
        switch (boundary) {
            case 'top': return `top:${i}:${j}`;
            case 'bottom': return `bottom:${i}:${j}`;
            case 'left': return `left:${i}:${j}`;
            case 'right': return `right:${i}:${j}`;
            default: return `unknown:${i}:${j}`;
        }
    }

    /**
     * Merge with neighboring tiles using improved logic
     * @private
     */
    mergeWithNeighborsImproved(i, j) {
        const neighbors = [
            { i: i - 1, j: j, boundary: "top", opposite: "bottom" },
            { i: i + 1, j: j, boundary: "bottom", opposite: "top" },
            { i: i, j: j - 1, boundary: "left", opposite: "right" },
            { i: i, j: j + 1, boundary: "right", opposite: "left" }
        ];

        if (this.debug) {
            console.log(`Checking neighbors for tile (${i},${j})`);
        }

        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.i},${neighbor.j}`;
            if (!this.tiles.has(neighborKey)) {
                if (this.debug) {
                    console.log(`  Neighbor (${neighbor.i},${neighbor.j}) not available`);
                }
                continue;
            }

            if (this.debug) {
                console.log(`  Merging with neighbor (${neighbor.i},${neighbor.j}) via ${neighbor.boundary}`);
            }

            for (const level of this.levels) {
                this.mergeLineStringsAtLevelImproved(i, j, neighbor.i, neighbor.j, level, neighbor.boundary, neighbor.opposite);
            }
        }
    }

    /**
     * Merge LineStrings at a specific level with improved logic
     * @private
     */
    mergeLineStringsAtLevelImproved(i1, j1, i2, j2, level, boundary1, boundary2) {
        if (!this.boundaryStrips.has(level)) return;

        const strips = this.boundaryStrips.get(level);
        const stripKey1 = this.getStripKey(i1, j1, boundary1);
        const stripKey2 = this.getStripKey(i2, j2, boundary2);

        const strips1 = strips.get(stripKey1) || [];
        const strips2 = strips.get(stripKey2) || [];

        if (strips1.length === 0 || strips2.length === 0) return;

        this.stats.mergeAttempts++;

        if (this.debug) {
            console.log(`    Attempting merge at level ${level}: ${strips1.length} vs ${strips2.length} strips`);
        }

        // Find connections using improved detection
        for (const strip1 of strips1) {
            for (const strip2 of strips2) {
                const connection = this.findBestConnection(strip1.lineString, strip2.lineString);
                
                if (connection) {
                    if (this.debug) {
                        console.log(`      Found connection: distance=${connection.distance.toFixed(6)}`);
                    }

                    const mergedLineString = this.mergeAtConnectionImproved(
                        strip1.lineString, 
                        strip2.lineString, 
                        connection
                    );

                    if (mergedLineString) {
                        // Add to merged LineStrings
                        if (!this.mergedLineStrings.has(level)) {
                            this.mergedLineStrings.set(level, []);
                        }

                        const mergedList = this.mergedLineStrings.get(level);
                        
                        // Remove original LineStrings from merged list if they exist
                        const index1 = mergedList.indexOf(strip1.lineString);
                        const index2 = mergedList.indexOf(strip2.lineString);
                        
                        if (index1 >= 0) mergedList.splice(index1, 1);
                        if (index2 >= 0) mergedList.splice(index2, 1);
                        mergedList.push(mergedLineString);

                        // Update boundary strips
                        this.updateBoundaryStripsImproved(level, strip1, strip2, mergedLineString);

                        this.stats.successfulMerges++;
                        this.stats.boundaryConnections++;

                        if (this.debug) {
                            console.log(`      Merge successful: ${mergedLineString.length} points`);
                        }
                    }
                }
            }
        }
    }

    /**
     * Find best connection between two LineStrings with improved logic
     * @private
     */
    findBestConnection(lineString1, lineString2) {
        const connections = [];
        const endpoints1 = [
            { point: lineString1[0], index: 0, isStart: true },
            { point: lineString1[lineString1.length - 1], index: lineString1.length - 1, isStart: false }
        ];
        const endpoints2 = [
            { point: lineString2[0], index: 0, isStart: true },
            { point: lineString2[lineString2.length - 1], index: lineString2.length - 1, isStart: false }
        ];

        // Check all endpoint combinations with improved tolerance
        for (const ep1 of endpoints1) {
            for (const ep2 of endpoints2) {
                const distance = this.distance(ep1.point, ep2.point);
                
                // Use more generous connection tolerance
                const connectionTolerance = Math.max(this.EPSILON * 50, this.BOUNDARY_TOLERANCE);
                
                if (distance < connectionTolerance) {
                    connections.push({
                        ep1, ep2, distance,
                        type: 'endpoint',
                        connectionType: `${ep1.isStart ? 'start' : 'end'}_to_${ep2.isStart ? 'start' : 'end'}`
                    });
                }
            }
        }

        // Sort by distance (closest first)
        connections.sort((a, b) => a.distance - b.distance);
        
        return connections.length > 0 ? connections[0] : null;
    }

    /**
     * Merge LineStrings at connection with improved logic and debugging
     * @private
     */
    mergeAtConnectionImproved(lineString1, lineString2, connection) {
        const { ep1, ep2 } = connection;
        
        if (this.debug) {
            console.log(`        Merging connection type: ${connection.connectionType}`);
            console.log(`        Line1: ${lineString1.length} points (${ep1.isStart ? 'start' : 'end'} selected)`);
            console.log(`        Line2: ${lineString2.length} points (${ep2.isStart ? 'start' : 'end'} selected)`);
        }

        let result = [];

        // FIXED: Corrected merging logic for all four cases
        if (ep1.isStart && ep2.isStart) {
            // start1 connects to start2: reverse line1, then add line2 (skip duplicate point)
            result = [...lineString1.slice().reverse(), ...lineString2.slice(1)];
        } else if (ep1.isStart && !ep2.isStart) {
            // start1 connects to end2: add line2, then line1 (skip duplicate point)
            result = [...lineString2, ...lineString1.slice(1)];
        } else if (!ep1.isStart && ep2.isStart) {
            // end1 connects to start2: add line1, then line2 (skip duplicate point)
            result = [...lineString1, ...lineString2.slice(1)];
        } else {
            // end1 connects to end2: add line1, then reverse line2 (skip duplicate point)
            result = [...lineString1, ...lineString2.slice().reverse().slice(1)];
        }

        // Set properties
        result.level = lineString1.level;
        result.isClosed = this.isLineStringClosed(result);
        result.mergedFrom = [
            { tileOrigin: lineString1.tileOrigin, length: lineString1.length },
            { tileOrigin: lineString2.tileOrigin, length: lineString2.length }
        ];

        // Verify the merge quality
        const mergeQuality = this.verifyMergeQuality(lineString1, lineString2, result, connection);
        
        if (this.debug) {
            console.log(`        Merge quality: gap=${mergeQuality.connectionGap.toFixed(6)}, valid=${mergeQuality.isValid}`);
        }

        return mergeQuality.isValid ? result : null;
    }

    /**
     * Verify the quality of a merge operation
     * @private
     */
    verifyMergeQuality(lineString1, lineString2, mergedResult, connection) {
        const connectionGap = connection.distance;
        const maxAllowedGap = Math.max(this.EPSILON * 100, this.BOUNDARY_TOLERANCE);
        
        const quality = {
            connectionGap: connectionGap,
            isValid: connectionGap < maxAllowedGap,
            originalLengths: [lineString1.length, lineString2.length],
            mergedLength: mergedResult.length,
            expectedLength: lineString1.length + lineString2.length - 1 // -1 for merged point
        };

        // Additional validation
        if (Math.abs(mergedResult.length - quality.expectedLength) > 2) {
            quality.isValid = false;
            quality.warning = 'Unexpected length change during merge';
        }

        return quality;
    }

    /**
     * Update boundary strips after merging with improved tracking
     * @private
     */
    updateBoundaryStripsImproved(level, strip1, strip2, mergedLineString) {
        const strips = this.boundaryStrips.get(level);

        // Remove old strips more carefully
        for (const [stripKey, stripList] of strips.entries()) {
            const updatedList = stripList.filter(strip => 
                strip.lineString !== strip1.lineString && 
                strip.lineString !== strip2.lineString
            );

            if (updatedList.length === 0) {
                strips.delete(stripKey);
            } else {
                strips.set(stripKey, updatedList);
            }
        }

        // Add new strips for the merged LineString
        this.addStripsForLineStringImproved(level, mergedLineString);
    }

    /**
     * Add strips for a LineString with improved boundary detection
     * @private
     */
    addStripsForLineStringImproved(level, lineString) {
        // Determine which tiles this LineString spans
        const tileCoords = this.getLineStringTileCoords(lineString);
        
        for (const { i, j } of tileCoords) {
            // Only add strips if this tile exists
            const tileKey = `${i},${j}`;
            if (!this.tiles.has(tileKey)) continue;

            const boundaryIntersections = this.getBoundaryIntersectionsRobust(i, j, lineString);
            
            if (boundaryIntersections.length > 0) {
                const strips = this.getStripsForLevel(level);
                
                for (const boundary of boundaryIntersections) {
                    const stripKey = this.getStripKey(i, j, boundary);
                    
                    if (!strips.has(stripKey)) {
                        strips.set(stripKey, []);
                    }
                    
                    strips.get(stripKey).push({
                        lineString: lineString,
                        tileKey: tileKey,
                        boundary: boundary,
                        endpoints: this.getLineStringEndpoints(lineString)
                    });
                }
            }
        }
    }

    /**
     * Get tile coordinates that a LineString spans
     * @private
     */
    getLineStringTileCoords(lineString) {
        const tileCoords = new Set();
        
        for (const point of lineString) {
            const tileI = Math.floor(point.lat / this.tileSize);
            const tileJ = Math.floor(point.lon / this.tileSize);
            tileCoords.add(`${tileI},${tileJ}`);
        }

        return Array.from(tileCoords).map(coord => {
            const [i, j] = coord.split(',').map(Number);
            return { i, j };
        });
    }

    /**
     * Check if a LineString is closed (forms a loop)
     * @private
     */
    isLineStringClosed(lineString) {
        if (lineString.length < 3) return false;
        
        const first = lineString[0];
        const last = lineString[lineString.length - 1];
        
        return this.distance(first, last) < this.EPSILON;
    }

    /**
     * Calculate distance between two points
     * @private
     */
    distance(p1, p2) {
        const dx = p1.lon - p2.lon;
        const dy = p1.lat - p2.lat;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Get all current isolines as GeoJSON
     * @returns {Object} - GeoJSON FeatureCollection
     */
    getIsolinesAsGeoJSON() {
        const features = [];

        // Process merged LineStrings first
        for (const [level, lineStrings] of this.mergedLineStrings.entries()) {
            for (const lineString of lineStrings) {
                features.push(this.lineStringToGeoJSON(lineString, level));
            }
        }

        // Process remaining unmerged LineStrings from tiles
        for (const [tileKey, levelLineStrings] of this.tileLineStrings.entries()) {
            for (const [level, lineStrings] of levelLineStrings.entries()) {
                for (const lineString of lineStrings) {
                    // Check if this LineString has been merged
                    const isMerged = this.mergedLineStrings.has(level) &&
                        this.mergedLineStrings.get(level).includes(lineString);

                    if (!isMerged) {
                        features.push(this.lineStringToGeoJSON(lineString, level));
                    }
                }
            }
        }

        return {
            type: 'FeatureCollection',
            features: features,
            metadata: {
                stats: this.stats,
                tiles: this.tiles.size,
                levels: this.levels.length
            }
        };
    }

    /**
     * Convert a LineString to a GeoJSON feature with improved handling
     * @private
     */
    lineStringToGeoJSON(lineString, level) {
        const coordinates = lineString.map(point => [point.lon, point.lat]);

        // Check if LineString is closed and should be converted to Polygon
        const isClosed = lineString.isClosed || this.isLineStringClosed(lineString);

        if (isClosed && coordinates.length >= 4) {
            // Ensure polygon is properly closed
            if (!this.isPolygonClosed(coordinates)) {
                coordinates.push([...coordinates[0]]);
            }

            return {
                type: 'Feature',
                properties: {
                    level: level,
                    original_type: 'closed_linestring',
                    merged: !!lineString.mergedFrom,
                    point_count: coordinates.length
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
                    level: level,
                    original_type: 'open_linestring',
                    merged: !!lineString.mergedFrom,
                    point_count: coordinates.length
                },
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                }
            };
        }
    }

    /**
     * Check if a polygon is closed
     * @private
     */
    isPolygonClosed(coordinates) {
        if (coordinates.length < 2) return false;

        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];

        return first[0] === last[0] && first[1] === last[1];
    }

    /**
     * Get all current isolines (for debugging or further processing)
     * @returns {Map} - Map of level -> array of isolines
     */
    getAllIsolines() {
        const result = new Map();

        // Add merged LineStrings
        for (const [level, lineStrings] of this.mergedLineStrings.entries()) {
            if (!result.has(level)) {
                result.set(level, []);
            }
            result.get(level).push(...lineStrings);
        }

        // Add unmerged LineStrings from tiles
        for (const [tileKey, levelLineStrings] of this.tileLineStrings.entries()) {
            for (const [level, lineStrings] of levelLineStrings.entries()) {
                for (const lineString of lineStrings) {
                    const isMerged = this.mergedLineStrings.has(level) &&
                        this.mergedLineStrings.get(level).includes(lineString);

                    if (!isMerged) {
                        if (!result.has(level)) {
                            result.set(level, []);
                        }
                        result.get(level).push(lineString);
                    }
                }
            }
        }

        return result;
    }

    /**
     * Get comprehensive statistics about the current state
     * @returns {Object} - Statistics object
     */
    getStatistics() {
        const stats = {
            ...this.stats,
            tiles: this.tiles.size,
            levels: this.levels.length,
            boundaryStrips: 0,
            mergedLineStrings: 0,
            totalLineStrings: 0,
            closedLineStrings: 0,
            openLineStrings: 0,
            averagePointsPerLineString: 0,
            mergeSuccessRate: 0
        };

        // Count boundary strips
        for (const [level, strips] of this.boundaryStrips.entries()) {
            stats.boundaryStrips += strips.size;
        }

        // Count merged LineStrings
        for (const [level, lineStrings] of this.mergedLineStrings.entries()) {
            stats.mergedLineStrings += lineStrings.length;
        }

        // Count all LineStrings and analyze them
        const allLineStrings = this.getAllIsolines();
        let totalPoints = 0;
        
        for (const [level, lineStrings] of allLineStrings.entries()) {
            stats.totalLineStrings += lineStrings.length;
            
            for (const lineString of lineStrings) {
                totalPoints += lineString.length;
                
                if (this.isLineStringClosed(lineString)) {
                    stats.closedLineStrings++;
                } else {
                    stats.openLineStrings++;
                }
            }
        }

        // Calculate averages and rates
        if (stats.totalLineStrings > 0) {
            stats.averagePointsPerLineString = totalPoints / stats.totalLineStrings;
        }

        if (this.stats.mergeAttempts > 0) {
            stats.mergeSuccessRate = (this.stats.successfulMerges / this.stats.mergeAttempts * 100).toFixed(2);
        }

        return stats;
    }

    /**
     * Debug logging for tile processing
     * @private
     */
    debugTileProcessing(i, j, tileLineStrings) {
        console.log(`Tile (${i},${j}) processing results:`);
        
        for (const [level, lineStrings] of tileLineStrings.entries()) {
            console.log(`  Level ${level}: ${lineStrings.length} linestrings`);
            
            lineStrings.forEach((ls, idx) => {
                const endpoints = this.getLineStringEndpoints(ls);
                console.log(`    LineString ${idx}: ${ls.length} points, closed: ${ls.isClosed}`);
                
                if (!endpoints.isClosed && ls.length >= 2) {
                    console.log(`      Start: (${ls[0].lat.toFixed(3)}, ${ls[0].lon.toFixed(3)})`);
                    console.log(`      End: (${ls[ls.length-1].lat.toFixed(3)}, ${ls[ls.length-1].lon.toFixed(3)})`);
                }
            });
        }

        // Show boundary strips
        for (const [level, strips] of this.boundaryStrips.entries()) {
            const stripCount = Array.from(strips.values()).reduce((sum, arr) => sum + arr.length, 0);
            console.log(`  Boundary strips for level ${level}: ${stripCount} total`);
            
            for (const [stripKey, stripArray] of strips.entries()) {
                if (stripArray.length > 0) {
                    console.log(`    ${stripKey}: ${stripArray.length} strips`);
                }
            }
        }
    }

    /**
     * Get detailed debug information about a specific level
     * @param {number} level - The contour level to debug
     * @returns {Object} - Debug information
     */
    debugLevel(level) {
        const debug = {
            level: level,
            tiles: [],
            boundaryStrips: {},
            mergedLineStrings: 0,
            unmergedLineStrings: 0,
            connections: []
        };

        // Analyze tiles for this level
        for (const [tileKey, levelLineStrings] of this.tileLineStrings.entries()) {
            if (levelLineStrings.has(level)) {
                const lineStrings = levelLineStrings.get(level);
                debug.tiles.push({
                    tileKey: tileKey,
                    lineStringCount: lineStrings.length,
                    lineStrings: lineStrings.map(ls => ({
                        points: ls.length,
                        closed: this.isLineStringClosed(ls),
                        bounds: this.getLineStringBounds(ls)
                    }))
                });
            }
        }

        // Analyze boundary strips
        if (this.boundaryStrips.has(level)) {
            const strips = this.boundaryStrips.get(level);
            for (const [stripKey, stripArray] of strips.entries()) {
                debug.boundaryStrips[stripKey] = stripArray.length;
            }
        }

        // Count merged vs unmerged
        if (this.mergedLineStrings.has(level)) {
            debug.mergedLineStrings = this.mergedLineStrings.get(level).length;
        }

        // Calculate unmerged count
        for (const [tileKey, levelLineStrings] of this.tileLineStrings.entries()) {
            if (levelLineStrings.has(level)) {
                const lineStrings = levelLineStrings.get(level);
                for (const lineString of lineStrings) {
                    const isMerged = this.mergedLineStrings.has(level) &&
                        this.mergedLineStrings.get(level).includes(lineString);
                    if (!isMerged) {
                        debug.unmergedLineStrings++;
                    }
                }
            }
        }

        return debug;
    }

    /**
     * Get bounding box of a LineString
     * @private
     */
    getLineStringBounds(lineString) {
        if (lineString.length === 0) return null;

        let minLat = lineString[0].lat;
        let maxLat = lineString[0].lat;
        let minLon = lineString[0].lon;
        let maxLon = lineString[0].lon;

        for (const point of lineString) {
            minLat = Math.min(minLat, point.lat);
            maxLat = Math.max(maxLat, point.lat);
            minLon = Math.min(minLon, point.lon);
            maxLon = Math.max(maxLon, point.lon);
        }

        return { minLat, maxLat, minLon, maxLon };
    }

    /**
     * Validate the current state and identify potential issues
     * @returns {Object} - Validation results
     */
    validateState() {
        const validation = {
            isValid: true,
            warnings: [],
            errors: [],
            statistics: this.getStatistics()
        };

        // Check for orphaned boundary strips
        for (const [level, strips] of this.boundaryStrips.entries()) {
            for (const [stripKey, stripArray] of strips.entries()) {
                if (stripArray.length === 0) {
                    validation.warnings.push(`Empty boundary strip: ${stripKey} at level ${level}`);
                } else if (stripArray.length > 10) {
                    validation.warnings.push(`High boundary strip count: ${stripKey} has ${stripArray.length} strips at level ${level}`);
                }
            }
        }

        // Check for potential connection issues
        for (const [level, lineStrings] of this.mergedLineStrings.entries()) {
            for (const lineString of lineStrings) {
                if (lineString.mergedFrom && lineString.mergedFrom.length > 2) {
                    validation.warnings.push(`Complex merge detected: LineString at level ${level} merged from ${lineString.mergedFrom.length} sources`);
                }
            }
        }

        // Check merge success rate
        if (this.stats.mergeAttempts > 0) {
            const successRate = this.stats.successfulMerges / this.stats.mergeAttempts;
            if (successRate < 0.5) {
                validation.warnings.push(`Low merge success rate: ${(successRate * 100).toFixed(1)}%`);
            }
        }

        // Check for extremely small LineStrings
        const allIsolines = this.getAllIsolines();
        for (const [level, lineStrings] of allIsolines.entries()) {
            for (const lineString of lineStrings) {
                if (lineString.length < 2) {
                    validation.errors.push(`Invalid LineString at level ${level}: only ${lineString.length} points`);
                    validation.isValid = false;
                }
            }
        }

        return validation;
    }

    /**
     * Reset the builder state (for testing or reprocessing)
     */
    reset() {
        this.tiles.clear();
        this.tileLineStrings.clear();
        this.boundaryStrips.clear();
        this.mergedLineStrings.clear();
        
        this.stats = {
            tilesProcessed: 0,
            mergeAttempts: 0,
            successfulMerges: 0,
            boundaryConnections: 0
        };

        if (this.debug) {
            console.log('TiledIsolineBuilder state reset');
        }
    }

    /**
     * Export configuration and state for debugging
     * @returns {Object} - Complete state export
     */
    exportState() {
        return {
            configuration: {
                levels: this.levels,
                tileSize: this.tileSize,
                epsilon: this.EPSILON,
                stripWidth: this.STRIP_WIDTH,
                boundaryTolerance: this.BOUNDARY_TOLERANCE,
                debug: this.debug
            },
            tiles: Array.from(this.tiles.keys()),
            statistics: this.getStatistics(),
            validation: this.validateState(),
            levelAnalysis: this.levels.reduce((acc, level) => {
                acc[level] = this.debugLevel(level);
                return acc;
            }, {})
        };
    }
}

module.exports = TiledIsolineBuilder;

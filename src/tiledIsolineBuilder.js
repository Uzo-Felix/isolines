/**
 * Handles incremental isoline generation from tiled grid data
 * Builds and merges isolines as new tiles arrive
 * Now uses LineString approach with boundary strips and overlaps detection
 */
const IsolineBuilder = require('./isolineBuilder');
const Conrec = require('./conrec');
const SpatialIndex = require('./spatialIndex');

class TiledIsolineBuilder {
    constructor(levels = [], tileSize = 128) {
        this.levels = levels;
        this.tileSize = tileSize;
        this.tiles = new Map(); 
        this.tileLineStrings = new Map();
        this.boundaryStrips = new Map(); // Store boundary strips
        this.mergedLineStrings = new Map();
        this.conrec = new Conrec();
        this.builder = new IsolineBuilder();
        this.EPSILON = 0.000001;
        this.STRIP_WIDTH = 2;
    }

    /**
     * Add a new tile of data and update isolines
     * @param {number} i - Tile row index
     * @param {number} j - Tile column index
     * @param {number[][]} tileData - 2D grid of values for this tile
     * @returns {Object} - Updated isolines as GeoJSON
     */
    addTile(i, j, tileData) {
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

        if (tileData.some(row => row.some(val => isNaN(val)))) {
            console.warn(`Tile (${i},${j}) contains NaN values which will be treated as 0`);
            tileData = tileData.map(row => row.map(val => isNaN(val) ? 0 : val));
        }

        const tileKey = `${i},${j}`;
        this.tiles.set(tileKey, tileData);

        // Process tile to generate LineStrings
        const tileLineStrings = this.processTile(i, j, tileData);
        this.tileLineStrings.set(tileKey, tileLineStrings);

        // Extract and store boundary strips
        this.extractBoundaryStrips(i, j, tileLineStrings);

        // Merge with neighboring tiles using overlaps detection
        this.mergeWithNeighborsUsingOverlaps(i, j);

        return this.getIsolinesAsGeoJSON();
    }

    /**
     * Process a single tile to generate LineStrings (not Polygons)
     * @private
     */
    processTile(i, j, tileData) {
        const tileLineStrings = new Map();

        for (const level of this.levels) {
            const segments = this.conrec.computeSegments(tileData, [level]);

            // Use buildLineStrings instead of buildIsolines to get open LineStrings
            const lineStrings = this.builder.buildLineStrings(segments, 1);

            const transformedLineStrings = lineStrings.map(lineString => {
                const transformedPoints = lineString.map(point => ({
                    lat: point.lat + (i * this.tileSize),
                    lon: point.lon + (j * this.tileSize),
                    level: lineString.level
                }));

                transformedPoints.level = lineString.level;
                transformedPoints.isClosed = this.isLineStringClosed(transformedPoints);

                return transformedPoints;
            });

            tileLineStrings.set(level, transformedLineStrings);
        }

        return tileLineStrings;
    }

    /**
     * Extract boundary strips from tile LineStrings
     * @private
     */
    extractBoundaryStrips(i, j, tileLineStrings) {
        const tileKey = `${i},${j}`;
        
        for (const [level, lineStrings] of tileLineStrings.entries()) {
            const strips = this.getStripsForLevel(level);
            
            for (const lineString of lineStrings) {
                // Check if LineString intersects tile boundaries
                const boundaryIntersections = this.getBoundaryIntersections(i, j, lineString);
                
                if (boundaryIntersections.length > 0) {
                    // Store strips for each boundary this LineString crosses
                    for (const boundary of boundaryIntersections) {
                        const stripKey = this.getStripKey(i, j, boundary);
                        
                        if (!strips.has(stripKey)) {
                            strips.set(stripKey, []);
                        }
                        
                        strips.get(stripKey).push({
                            lineString: lineString,
                            tileKey: tileKey,
                            boundary: boundary
                        });
                    }
                }
            }
        }
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
     * Get boundary intersections for a LineString
     * @private
     */
    getBoundaryIntersections(i, j, lineString) {
        const boundaries = [];
        const tileStartLat = i * this.tileSize;
        const tileEndLat = (i + 1) * this.tileSize;
        const tileStartLon = j * this.tileSize;
        const tileEndLon = (j + 1) * this.tileSize;

        for (const point of lineString) {
            // Check if point is near tile boundaries
            if (Math.abs(point.lat - tileStartLat) < this.STRIP_WIDTH) {
                if (!boundaries.includes('top')) boundaries.push('top');
            }
            if (Math.abs(point.lat - tileEndLat) < this.STRIP_WIDTH) {
                if (!boundaries.includes('bottom')) boundaries.push('bottom');
            }
            if (Math.abs(point.lon - tileStartLon) < this.STRIP_WIDTH) {
                if (!boundaries.includes('left')) boundaries.push('left');
            }
            if (Math.abs(point.lon - tileEndLon) < this.STRIP_WIDTH) {
                if (!boundaries.includes('right')) boundaries.push('right');
            }
        }

        return boundaries;
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
     * Merge with neighboring tiles using overlaps detection
     * @private
     */
    mergeWithNeighborsUsingOverlaps(i, j) {
        const neighbors = [
            { i: i - 1, j: j, boundary: "top" },
            { i: i + 1, j: j, boundary: "bottom" },
            { i: i, j: j - 1, boundary: "left" },
            { i: i, j: j + 1, boundary: "right" }
        ];

        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.i},${neighbor.j}`;
            if (!this.tiles.has(neighborKey)) continue;

            for (const level of this.levels) {
                this.mergeLineStringsAtLevel(i, j, neighbor.i, neighbor.j, level, neighbor.boundary);
            }
        }
    }

    /**
     * Merge LineStrings at a specific level between two tiles
     * @private
     */
    mergeLineStringsAtLevel(i1, j1, i2, j2, level, boundary) {
        if (!this.boundaryStrips.has(level)) return;

        const strips = this.boundaryStrips.get(level);
        const stripKey1 = this.getStripKey(i1, j1, boundary);
        const stripKey2 = this.getStripKey(i2, j2, this.getOppositeBoundary(boundary));

        const strips1 = strips.get(stripKey1) || [];
        const strips2 = strips.get(stripKey2) || [];

        if (strips1.length === 0 || strips2.length === 0) return;

        // Find overlapping LineStrings using OVERLAPS predicate
        for (const strip1 of strips1) {
            for (const strip2 of strips2) {
                if (this.lineStringsOverlap(strip1.lineString, strip2.lineString)) {
                    const mergedLineString = this.mergeOverlappingLineStrings(
                        strip1.lineString, 
                        strip2.lineString
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
                        this.updateBoundaryStrips(level, strip1, strip2, mergedLineString);
                    }
                }
            }
        }
    }

    /**
     * Get opposite boundary name
     * @private
     */
    getOppositeBoundary(boundary) {
        const opposites = {
            'top': 'bottom',
            'bottom': 'top',
            'left': 'right',
            'right': 'left'
        };
        return opposites[boundary] || boundary;
    }

    /**
     * Check if two LineStrings overlap using OVERLAPS predicate
     * @private
     */
    lineStringsOverlap(lineString1, lineString2) {
        // Simple overlap detection: check if any segment from one LineString
        // intersects with any segment from the other LineString
        
        for (let i = 0; i < lineString1.length - 1; i++) {
            const seg1 = {
                p1: lineString1[i],
                p2: lineString1[i + 1]
            };

            for (let j = 0; j < lineString2.length - 1; j++) {
                const seg2 = {
                    p1: lineString2[j],
                    p2: lineString2[j + 1]
                };

                if (this.segmentsIntersect(seg1, seg2)) {
                    return true;
                }
            }
        }

        // Also check for endpoint proximity (for near-overlaps)
        for (const point1 of [lineString1[0], lineString1[lineString1.length - 1]]) {
            for (const point2 of [lineString2[0], lineString2[lineString2.length - 1]]) {
                if (this.distance(point1, point2) < this.EPSILON * 10) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if two line segments intersect
     * @private
     */
    segmentsIntersect(seg1, seg2) {
        const { p1: p1, p2: p2 } = seg1;
        const { p1: p3, p2: p4 } = seg2;

        // Calculate the direction of the four points
        const d1 = this.crossProduct(p4, p1, p2);
        const d2 = this.crossProduct(p4, p2, p3);
        const d3 = this.crossProduct(p2, p3, p4);
        const d4 = this.crossProduct(p2, p4, p1);

        // Check if segments intersect
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }

        // Check for collinear segments
        if (Math.abs(d1) < this.EPSILON && this.onSegment(p1, p4, p2)) return true;
        if (Math.abs(d2) < this.EPSILON && this.onSegment(p2, p4, p3)) return true;
        if (Math.abs(d3) < this.EPSILON && this.onSegment(p3, p2, p4)) return true;
        if (Math.abs(d4) < this.EPSILON && this.onSegment(p4, p2, p1)) return true;

        return false;
    }

    /**
     * Calculate cross product for three points
     * @private
     */
    crossProduct(p1, p2, p3) {
        return (p2.lat - p1.lat) * (p3.lon - p1.lon) - (p2.lon - p1.lon) * (p3.lat - p1.lat);
    }

    /**
     * Check if point q lies on line segment pr
     * @private
     */
    onSegment(p, q, r) {
        return q.lon <= Math.max(p.lon, r.lon) &&
               q.lon >= Math.min(p.lon, r.lon) &&
               q.lat <= Math.max(p.lat, r.lat) &&
               q.lat >= Math.min(p.lat, r.lat);
    }

    /**
     * Merge two overlapping LineStrings into a single LineString
     * @private
     */
    mergeOverlappingLineStrings(lineString1, lineString2) {
        // Find the best connection points between the two LineStrings
        const connections = this.findConnectionPoints(lineString1, lineString2);
        
        if (connections.length === 0) {
            // If no clear connection, try simple concatenation
            return this.concatenateLineStrings(lineString1, lineString2);
        }

        // Use the best connection to merge the LineStrings
        const bestConnection = connections[0];
        return this.mergeAtConnection(lineString1, lineString2, bestConnection);
    }

    /**
     * Find potential connection points between two LineStrings
     * @private
     */
    findConnectionPoints(lineString1, lineString2) {
        const connections = [];
        const endpoints1 = [
            { point: lineString1[0], index: 0, isStart: true },
            { point: lineString1[lineString1.length - 1], index: lineString1.length - 1, isStart: false }
        ];
        const endpoints2 = [
            { point: lineString2[0], index: 0, isStart: true },
            { point: lineString2[lineString2.length - 1], index: lineString2.length - 1, isStart: false }
        ];

        // Check all endpoint combinations
        for (const ep1 of endpoints1) {
            for (const ep2 of endpoints2) {
                const distance = this.distance(ep1.point, ep2.point);
                if (distance < this.EPSILON * 10) {
                    connections.push({
                        lineString1, lineString2,
                        ep1, ep2, distance,
                        type: 'endpoint'
                    });
                }
            }
        }

        // Sort by distance (closest first)
        connections.sort((a, b) => a.distance - b.distance);
        return connections;
    }

    /**
     * Simple concatenation of two LineStrings
     * @private
     */
    concatenateLineStrings(lineString1, lineString2) {
        // Try different concatenation orders and pick the best one
        const options = [
            [...lineString1, ...lineString2],
            [...lineString1, ...lineString2.slice().reverse()],
            [...lineString2, ...lineString1],
            [...lineString2, ...lineString1.slice().reverse()]
        ];

        // Pick the option with the smallest gap at the connection point
        let bestOption = options[0];
        let smallestGap = Infinity;

        for (const option of options) {
            const midIndex = lineString1.length - 1;
            if (midIndex >= 0 && midIndex + 1 < option.length) {
                const gap = this.distance(option[midIndex], option[midIndex + 1]);
                if (gap < smallestGap) {
                    smallestGap = gap;
                    bestOption = option;
                }
            }
        }

        bestOption.level = lineString1.level;
        bestOption.isClosed = this.isLineStringClosed(bestOption);
        return bestOption;
    }

    /**
     * Merge LineStrings at a specific connection point
     * @private
     */
    mergeAtConnection(lineString1, lineString2, connection) {
        const { ep1, ep2 } = connection;
        
        let result = [];

        // Four cases for merging based on which endpoints connect:
        if (ep1.isStart && ep2.isStart) {
            // start-to-start: reverse lineString1, then concat lineString2
            result = [...lineString1.slice().reverse(), ...lineString2.slice(1)];
        } else if (ep1.isStart && !ep2.isStart) {
            // start-to-end: concat lineString2, then lineString1
            result = [...lineString2, ...lineString1.slice(1)];
        } else if (!ep1.isStart && ep2.isStart) {
            // end-to-start: concat lineString1, then lineString2
            result = [...lineString1, ...lineString2.slice(1)];
        } else {
            // end-to-end: concat lineString1, then reverse of lineString2
            result = [...lineString1, ...lineString2.slice().reverse().slice(1)];
        }

        result.level = lineString1.level;
        result.isClosed = this.isLineStringClosed(result);
        return result;
    }

    /**
     * Update boundary strips after merging
     * @private
     */
    updateBoundaryStrips(level, strip1, strip2, mergedLineString) {
        const strips = this.boundaryStrips.get(level);

        // Remove old strips
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
        this.addStripsForLineString(level, mergedLineString);
    }

    /**
     * Add strips for a LineString
     * @private
     */
    addStripsForLineString(level, lineString) {
        // Determine which tiles this LineString spans
        const tileCoords = this.getLineStringTileCoords(lineString);
        
        for (const { i, j } of tileCoords) {
            const boundaryIntersections = this.getBoundaryIntersections(i, j, lineString);
            
            if (boundaryIntersections.length > 0) {
                const strips = this.getStripsForLevel(level);
                
                for (const boundary of boundaryIntersections) {
                    const stripKey = this.getStripKey(i, j, boundary);
                    
                    if (!strips.has(stripKey)) {
                        strips.set(stripKey, []);
                    }
                    
                    strips.get(stripKey).push({
                        lineString: lineString,
                        tileKey: `${i},${j}`,
                        boundary: boundary
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
            features: features
        };
    }

    /**
     * Convert a LineString to a GeoJSON feature
     * Convert closed LineStrings to Polygons
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
                    original_type: 'closed_linestring'
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
                    original_type: 'open_linestring'
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
     * Get statistics about the current state (for debugging)
     * @returns {Object} - Statistics object
     */
    getStatistics() {
        const stats = {
            tiles: this.tiles.size,
            levels: this.levels.length,
            boundaryStrips: 0,
            mergedLineStrings: 0,
            totalLineStrings: 0,
            closedLineStrings: 0,
            openLineStrings: 0
        };

        // Count boundary strips
        for (const [level, strips] of this.boundaryStrips.entries()) {
            stats.boundaryStrips += strips.size;
        }

        // Count merged LineStrings
        for (const [level, lineStrings] of this.mergedLineStrings.entries()) {
            stats.mergedLineStrings += lineStrings.length;
        }

        // Count all LineStrings and categorize them
        const allLineStrings = this.getAllIsolines();
        for (const [level, lineStrings] of allLineStrings.entries()) {
            stats.totalLineStrings += lineStrings.length;
            
            for (const lineString of lineStrings) {
                if (this.isLineStringClosed(lineString)) {
                    stats.closedLineStrings++;
                } else {
                    stats.openLineStrings++;
                }
            }
        }

        return stats;
    }
}

module.exports = TiledIsolineBuilder;
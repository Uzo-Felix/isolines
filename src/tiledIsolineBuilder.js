/**
 * Handles incremental isoline generation from tiled grid data
 * Builds and merges isolines as new tiles arrive
 */
const IsolineBuilder = require('./isolineBuilder');
const Conrec = require('./conrec');
const SpatialIndex = require('./spatialIndex');

class TiledIsolineBuilder {
    constructor(levels = [], tileSize = 128) {
        this.levels = levels;
        this.tileSize = tileSize;
        this.tiles = new Map(); 
        this.tileIsolines = new Map();
        this.mergedIsolines = new Map();
        this.edgePoints = new Map();
        this.conrec = new Conrec();
        this.builder = new IsolineBuilder();
        this.EPSILON = 0.000001;
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

        const tileIsolines = this.processTile(i, j, tileData);
        this.tileIsolines.set(tileKey, tileIsolines);

        this.mergeWithNeighbors(i, j);

        return this.getIsolinesAsGeoJSON();
    }

    /**
     * Process a single tile to generate isolines
     * @private
     */
    processTile(i, j, tileData) {
        const tileIsolines = new Map();

        for (const level of this.levels) {
            const segments = this.conrec.computeSegments(tileData, [level]);

            const isolines = this.builder.buildIsolines(segments, 1);

            const transformedIsolines = isolines.map(isoline => {
                const transformedPoints = isoline.map(point => ({
                    lat: point.lat + (i * this.tileSize),
                    lon: point.lon + (j * this.tileSize),
                    level: isoline.level
                }));

                transformedPoints.level = isoline.level;

                return transformedPoints;
            });

            tileIsolines.set(level, transformedIsolines);

            this.extractEdgePoints(i, j, transformedIsolines, level);
        }

        return tileIsolines;
    }

    /**
     * Extract edge points from isolines for merging
     * @private
     */
    extractEdgePoints(i, j, isolines, level) {
        if (!this.edgePoints.has(level)) {
            this.edgePoints.set(level, new Map());
        }

        const levelEdgePoints = this.edgePoints.get(level);

        for (const isoline of isolines) {
            if (isoline.length < 2) continue;

            const isClosed = this.pointsEqual(isoline[0], isoline[isoline.length - 1]);

            if (!isClosed) {
                const startPoint = isoline[0];
                const endPoint = isoline[isoline.length - 1];

                const startEdge = this.getEdgeKey(i, j, startPoint);
                const endEdge = this.getEdgeKey(i, j, endPoint);

                if (startEdge) {
                    if (!levelEdgePoints.has(startEdge)) {
                        levelEdgePoints.set(startEdge, []);
                    }
                    levelEdgePoints.get(startEdge).push({
                        point: startPoint,
                        isoline: isoline,
                        isStart: true,
                        tileKey: `${i},${j}`
                    });
                }

                if (endEdge) {
                    if (!levelEdgePoints.has(endEdge)) {
                        levelEdgePoints.set(endEdge, []);
                    }
                    levelEdgePoints.get(endEdge).push({
                        point: endPoint,
                        isoline: isoline,
                        isStart: false,
                        tileKey: `${i},${j}`
                    });
                }
            }
        }
    }

    /**
     * Determine if a point is on a tile edge and return the edge key
     * @private
     */
    getEdgeKey(i, j, point) {
        const tileStartLat = i * this.tileSize;
        const tileEndLat = (i + 1) * this.tileSize;
        const tileStartLon = j * this.tileSize;
        const tileEndLon = (j + 1) * this.tileSize;

        if (Math.abs(point.lat - tileStartLat) < this.EPSILON) {
            return `top:${j}:${Math.floor(point.lon)}`;
        } else if (Math.abs(point.lat - tileEndLat) < this.EPSILON) {
            return `bottom:${j}:${Math.floor(point.lon)}`;
        } else if (Math.abs(point.lon - tileStartLon) < this.EPSILON) {
            return `left:${i}:${Math.floor(point.lat)}`;
        } else if (Math.abs(point.lon - tileEndLon) < this.EPSILON) {
            return `right:${i}:${Math.floor(point.lat)}`;
        }

        return null;
    }

    /**
     * Find and merge with neighboring tiles
     * @private
     */
    mergeWithNeighbors(i, j) {
        const neighbors = [
            { i: i - 1, j: j, edge: "bottom", opposite: "top" },  
            { i: i + 1, j: j, edge: "top", opposite: "bottom" },     
            { i: i, j: j - 1, edge: "right", opposite: "left" },  
            { i: i, j: j + 1, edge: "left", opposite: "right" }    
        ];

        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.i},${neighbor.j}`;

            if (!this.tiles.has(neighborKey)) continue;

            for (const level of this.levels) {
                this.mergeIsolinesAtLevel(i, j, neighbor.i, neighbor.j, level, neighbor.edge, neighbor.opposite);
            }
        }
    }

    /**
     * Merge isolines at a specific level between two tiles
     * @private
     */
    mergeIsolinesAtLevel(i1, j1, i2, j2, level, edge1, edge2) {
        if (!this.edgePoints.has(level)) return;

        const levelEdgePoints = this.edgePoints.get(level);
        const tileKey1 = `${i1},${j1}`;
        const tileKey2 = `${i2},${j2}`;

        const edgePrefix1 = `${edge1}:`;
        const edgePrefix2 = `${edge2}:`;

        const edgeEntries1 = [];
        const edgeEntries2 = [];

        for (const [edgeKey, entries] of levelEdgePoints.entries()) {
            if (edgeKey.startsWith(edgePrefix1)) {
                for (const entry of entries) {
                    if (entry.tileKey === tileKey1) {
                        edgeEntries1.push({ edgeKey, entry });
                    }
                }
            }

            if (edgeKey.startsWith(edgePrefix2)) {
                for (const entry of entries) {
                    if (entry.tileKey === tileKey2) {
                        edgeEntries2.push({ edgeKey, entry });
                    }
                }
            }
        }

        if (edgeEntries1.length > 0 && edgeEntries2.length > 0) {
            const spatialIndex = new SpatialIndex(1);
            const segments = edgeEntries2.map(({ entry }) => ({
                p1: entry.point,
                p2: entry.point,
                entry
            }));
            spatialIndex.buildIndex(segments);

            for (const { entry: entry1 } of edgeEntries1) {
                const neighbors = spatialIndex.findNeighbors(entry1.point);

                if (neighbors.length > 0) {
                    let closestNeighbor = null;
                    let minDistance = Infinity;

                    for (const neighbor of neighbors) {
                        const distance = this.distance(entry1.point, neighbor.p1);
                        if (distance < minDistance) {
                            minDistance = distance;
                            closestNeighbor = neighbor;
                        }
                    }

                    if (closestNeighbor && this.canMergePoints(entry1.point, closestNeighbor.p1)) {
                        const entry2 = closestNeighbor.entry;

                        const mergedIsoline = this.mergeIsolines(
                            entry1.isoline, entry1.isStart,
                            entry2.isoline, entry2.isStart
                        );

                        if (!this.mergedIsolines.has(level)) {
                            this.mergedIsolines.set(level, []);
                        }

                        const mergedList = this.mergedIsolines.get(level);

                        const index1 = mergedList.findIndex(iso => iso === entry1.isoline);
                        const index2 = mergedList.findIndex(iso => iso === entry2.isoline);

                        if (index1 >= 0) mergedList.splice(index1, 1);
                        if (index2 >= 0) mergedList.splice(index2, 1);

                        mergedList.push(mergedIsoline);

                        this.updateEdgePoints(level, entry1, entry2, mergedIsoline);
                    }
                }
            }
        }
    }

    /**
     * Check if two points can be merged (are close enough)
     * @private
     */
    canMergePoints(p1, p2) {
        return this.distance(p1, p2) < this.EPSILON * 10;
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
     * Check if two points are equal within epsilon
     * @private
     */
    pointsEqual(p1, p2) {
        return Math.abs(p1.lat - p2.lat) < this.EPSILON &&
            Math.abs(p1.lon - p2.lon) < this.EPSILON;
    }

    /**
     * Merge two isolines
     * @private
     */
    mergeIsolines(isoline1, isStart1, isoline2, isStart2) {
        let result = [];

        // Four cases for merging:
        // 1. start-to-start: reverse isoline1, then concat isoline2
        // 2. start-to-end: concat isoline2, then isoline1
        // 3. end-to-start: concat isoline1, then isoline2
        // 4. end-to-end: concat isoline1, then reverse of isoline2

        if (isStart1 && isStart2) {
            result = [...isoline1.slice().reverse(), ...isoline2.slice(1)];
        } else if (isStart1 && !isStart2) {
            result = [...isoline2, ...isoline1.slice(1)];
        } else if (!isStart1 && isStart2) {
            result = [...isoline1, ...isoline2.slice(1)];
        } else {
            result = [...isoline1, ...isoline2.slice().reverse().slice(1)];
        }

        result.level = isoline1.level;

        return result;
    }

    /**
     * Update edge points after merging isolines
     * @private
     */
    updateEdgePoints(level, entry1, entry2, mergedIsoline) {
        const levelEdgePoints = this.edgePoints.get(level);

        for (const [edgeKey, entries] of levelEdgePoints.entries()) {
            const updatedEntries = entries.filter(entry =>
                entry.isoline !== entry1.isoline && entry.isoline !== entry2.isoline);

            if (updatedEntries.length === 0) {
                levelEdgePoints.delete(edgeKey);
            } else {
                levelEdgePoints.set(edgeKey, updatedEntries);
            }
        }

        if (mergedIsoline.length >= 2) {
            const isClosed = this.pointsEqual(mergedIsoline[0], mergedIsoline[mergedIsoline.length - 1]);

            if (!isClosed) {
                const startPoint = mergedIsoline[0];
                const endPoint = mergedIsoline[mergedIsoline.length - 1];

                const startTileI = Math.floor(startPoint.lat / this.tileSize);
                const startTileJ = Math.floor(startPoint.lon / this.tileSize);
                const endTileI = Math.floor(endPoint.lat / this.tileSize);
                const endTileJ = Math.floor(endPoint.lon / this.tileSize);

                const startEdge = this.getEdgeKey(startTileI, startTileJ, startPoint);
                const endEdge = this.getEdgeKey(endTileI, endTileJ, endPoint);
                if (startEdge) {
                    if (!levelEdgePoints.has(startEdge)) {
                        levelEdgePoints.set(startEdge, []);
                    }
                    levelEdgePoints.get(startEdge).push({
                        point: startPoint,
                        isoline: mergedIsoline,
                        isStart: true,
                        tileKey: `${startTileI},${startTileJ}`
                    });
                }

                if (endEdge) {
                    if (!levelEdgePoints.has(endEdge)) {
                        levelEdgePoints.set(endEdge, []);
                    }
                    levelEdgePoints.get(endEdge).push({
                        point: endPoint,
                        isoline: mergedIsoline,
                        isStart: false,
                        tileKey: `${endTileI},${endTileJ}`
                    });
                }
            }
        }
    }

    /**
    * Get all current isolines as GeoJSON
    * @returns {Object} - GeoJSON FeatureCollection
    */
    getIsolinesAsGeoJSON() {
        const features = [];

        for (const [level, isolines] of this.mergedIsolines.entries()) {
            for (const isoline of isolines) {
                features.push(this.isolineToGeoJSON(isoline, level));
            }
        }

        for (const [tileKey, levelIsolines] of this.tileIsolines.entries()) {
            for (const [level, isolines] of levelIsolines.entries()) {
                for (const isoline of isolines) {
                    const isMerged = this.mergedIsolines.has(level) &&
                        this.mergedIsolines.get(level).includes(isoline);

                    if (!isMerged) {
                        features.push(this.isolineToGeoJSON(isoline, level));
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
    * Convert an isoline to a GeoJSON feature
    * @private
    */
    isolineToGeoJSON(isoline, level) {
        const coordinates = isoline.map(point => [point.lon, point.lat]);

        if (coordinates.length >= 3 && !this.isPolygonClosed(coordinates)) {
            coordinates.push([...coordinates[0]]);
        }

        return {
            type: 'Feature',
            properties: {
                level: level
            },
            geometry: {
                type: coordinates.length >= 4 ? 'Polygon' : 'LineString',
                coordinates: coordinates.length >= 4 ? [coordinates] : coordinates
            }
        };
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

        for (const [level, isolines] of this.mergedIsolines.entries()) {
            if (!result.has(level)) {
                result.set(level, []);
            }
            result.get(level).push(...isolines);
        }

        for (const [tileKey, levelIsolines] of this.tileIsolines.entries()) {
            for (const [level, isolines] of levelIsolines.entries()) {
                for (const isoline of isolines) {
                    const isMerged = this.mergedIsolines.has(level) &&
                        this.mergedIsolines.get(level).includes(isoline);

                    if (!isMerged) {
                        if (!result.has(level)) {
                            result.set(level, []);
                        }
                        result.get(level).push(isoline);
                    }
                }
            }
        }

        return result;
    }
}

module.exports = TiledIsolineBuilder;


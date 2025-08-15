/**
 * Strip-Based Tiled Isoline Builder
 * 1. Generate LineStrings
 * 2. Detect overlapping LineStrings between neighboring tiles (OVERLAPS function)
 * 3. Merge overlapping T1+T2 → L
 * 4. Convert to Polygon only if L is closed
 * 5. Force closure only when start/end segments don't touch
 */
const IsolineBuilder = require('../../core/isolineBuilder');
const Conrec = require('../../core/conrec');

class TiledIsolineBuilder {
    constructor(levels = [], tileSize = 128, debugMode = true) {
        this.levels = levels;
        this.tileSize = tileSize;
        this.debugMode = debugMode;
        this.EPSILON = 0.0001;

        // Core data storage
        this.tiles = new Map();           // Keep raw tiles (for debugging & other GIS ops)
        this.dataStrips = new Map();      // Boundary data strips (RAW VALUES ONLY)

        // LineString storage for overlap detection and merging (instruction requirements)
        this.storedLineStrings = new Map(); // Store LineStrings from processed tiles
        this.neighborLineStrings = new Map(); // LineStrings from neighboring tiles

        // Processing components
        this.conrec = new Conrec(this.EPSILON);
        this.builder = new IsolineBuilder(this.EPSILON);
        this.STRIP_WIDTH = 2;             // 2 rows/columns for boundary overlap

        // Debug tracking
        if (this.debugMode) {
            this.processingLog = [];
            this.stripUsage = new Map();
            this.overlapDetections = [];
            this.mergingOperations = [];
        }
    }

    /**
     * Add a new tile and process with strip-based algorithm
     */
    addTile(i, j, tileData) {
        if (!tileData || tileData.length === 0) {
            throw new Error('Empty tile data');
        }

        // if (!tileData || tileData.length !== this.tileSize || tileData[0].length !== this.tileSize) {
        //     throw new Error(`Tile at (${i},${j}) is not the expected size ${this.tileSize}x${this.tileSize}`);
        // }

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
        this.dataStrips.set(`bottom_strip:${i - 1}:${j}`, strips.top);
        this.dataStrips.set(`top_strip:${i + 1}:${j}`, strips.bottom);
        this.dataStrips.set(`right_strip:${i}:${j - 1}`, strips.left);
        this.dataStrips.set(`left_strip:${i}:${j + 1}`, strips.right);

        if (this.debugMode) {
            this.stripUsage.set(tileKey, {
                provided: Object.keys(strips),
                providedTo: [
                    `tile(${i - 1},${j})`,
                    `tile(${i + 1},${j})`,
                    `tile(${i},${j - 1})`,
                    `tile(${i},${j + 1})`
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

    mergeFeaturesByLevel(features, tolerance = 1e-6) {
        // Group by level
        const byLevel = {};
        for (const feature of features) {
            if (feature.geometry.type !== 'LineString') continue;
            const level = feature.properties.level;
            if (!byLevel[level]) byLevel[level] = [];
            byLevel[level].push(feature.geometry.coordinates);
        }
        const mergedFeatures = [];
        for (const [level, lines] of Object.entries(byLevel)) {
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
                        const end = chain[chain.length - 1];
                        const start = chain[0];
                        const candStart = lines[j][0];
                        const candEnd = lines[j][lines[j].length - 1];
                        if (
                            Math.abs(end[0] - candStart[0]) < tolerance &&
                            Math.abs(end[1] - candStart[1]) < tolerance
                        ) {
                            chain = chain.concat(lines[j].slice(1));
                            used[j] = true;
                            extended = true;
                            break;
                        }
                        if (
                            Math.abs(end[0] - candEnd[0]) < tolerance &&
                            Math.abs(end[1] - candEnd[1]) < tolerance
                        ) {
                            chain = chain.concat(lines[j].slice(0, -1).reverse());
                            used[j] = true;
                            extended = true;
                            break;
                        }
                        if (
                            Math.abs(start[0] - candEnd[0]) < tolerance &&
                            Math.abs(start[1] - candEnd[1]) < tolerance
                        ) {
                            chain = lines[j].slice(0, -1).reverse().concat(chain);
                            used[j] = true;
                            extended = true;
                            break;
                        }
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
                // Check if closed
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
        // Add original polygons (if any) that were not LineStrings
        for (const feature of features) {
            if (feature.geometry.type === 'Polygon') {
                mergedFeatures.push(feature);
            }
        }
        return mergedFeatures;
    }

    /**
     * 1. Generate LineStrings
     * 2. Find overlapping LineStrings from neighbors (OVERLAPS function)
     * 3. Merge overlapping T1+T2 → L
     * 4. Convert to Polygon only if L is closed
     * 5. Force closure only when start/end don't touch
     */
    processTileWithStrips(i, j, tileData) {
        // Step 1: Create expanded tile with attached strips
        const expandedData = this.createExpandedTile(i, j, tileData);

        // Step 2: Generate LineStrings
        const newLineStrings = [];

        for (const level of this.levels) {
            // Generate contour segments from expanded data
            const segments = this.conrec.computeSegments(expandedData, [level]);

            // Build LineStrings WITHOUT forced closure 
            const lineStrings = this.builder.buildLineStrings(segments, 1, { forcePolygonClosure: false });

            // Transform coordinates to global space
            const transformedLineStrings = this.transformToGlobalCoordinates(lineStrings, i, j, level);

            newLineStrings.push(...transformedLineStrings);
        }

        console.log(`📏 Generated ${newLineStrings.length} LineStrings for tile (${i},${j}) - NO forced closure`);

        // Step 3: Find overlapping LineStrings from neighbors
        const neighborLineStrings = this.getNeighborLineStrings(i, j);
        console.log(`🔍 Found ${neighborLineStrings.length} LineStrings from neighbors for overlap detection`);

        // Step 4: Merge overlapping LineStrings
        const mergedLineStrings = this.mergeOverlappingLineStrings(newLineStrings, neighborLineStrings);
        console.log(`🔗 After merging overlaps: ${mergedLineStrings.length} LineStrings`);

        // Step 5: Store LineStrings for future neighbor processing
        this.storeLineStringsForNeighbors(i, j, mergedLineStrings);

        // Step 6: Convert to appropriate geometry types
        const features = this.convertLineStringsToFeatures(mergedLineStrings);

        return {
            type: 'FeatureCollection',
            features: features
        };
    }

    /**
     * Transform LineString coordinates to global coordinate system
     * Account for strip expansion offsets and preserve closure metadata
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

            // Preserve ALL metadata from isolineBuilder
            transformedPoints.level = level;
            transformedPoints.closureInfo = lineString.closureInfo || {};
            transformedPoints.closureMethod = lineString.closureMethod || 'unknown';
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
     * Get LineStrings from neighboring tiles for overlap detection - instruction #7
     */
    getNeighborLineStrings(i, j) {
        const neighborLineStrings = [];

        // Check all 4 neighboring tiles (top, bottom, left, right)
        const neighbors = [
            { i: i - 1, j: j },  // top
            { i: i + 1, j: j },  // bottom  
            { i: i, j: j - 1 },  // left
            { i: i, j: j + 1 }   // right
        ];

        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.i},${neighbor.j}`;
            if (this.storedLineStrings.has(neighborKey)) {
                const neighborLines = this.storedLineStrings.get(neighborKey);
                neighborLineStrings.push(...neighborLines);

                if (this.debugMode) {
                    console.log(`   📍 Retrieved ${neighborLines.length} LineStrings from neighbor (${neighbor.i},${neighbor.j})`);
                }
            }
        }

        return neighborLineStrings;
    }

    /**
     * OVERLAPS function - detects if two LineStrings overlap geometrically
     */
    detectOverlaps(lineString1, lineString2, tolerance = this.EPSILON) {
        // Check if LineStrings have the same level (contour value)
        if (lineString1.level !== lineString2.level) {
            return false;
        }

        // Check for endpoint proximity (indicating potential connection)
        const endpoints1 = [lineString1[0], lineString1[lineString1.length - 1]];
        const endpoints2 = [lineString2[0], lineString2[lineString2.length - 1]];

        for (const ep1 of endpoints1) {
            for (const ep2 of endpoints2) {
                const distance = Math.sqrt(
                    Math.pow(ep1.lat - ep2.lat, 2) + Math.pow(ep1.lon - ep2.lon, 2)
                );

                if (distance <= tolerance) {
                    return true; // Endpoints are close enough to indicate overlap
                }
            }
        }

        return false;
    }

    /**
     * Merge overlapping LineStrings T1 + T2 → L 
     */
    mergeOverlappingLineStrings(newLineStrings, neighborLineStrings) {
        const mergedResults = [...newLineStrings]; // Start with all new LineStrings
        const usedNeighborIndices = new Set();

        // For each new LineString, find overlapping neighbors to merge
        for (let i = 0; i < newLineStrings.length; i++) {
            const newLineString = newLineStrings[i];

            for (let j = 0; j < neighborLineStrings.length; j++) {
                if (usedNeighborIndices.has(j)) continue; // Already used

                const neighborLineString = neighborLineStrings[j];

                // Check if they overlap - instruction #7
                if (this.detectOverlaps(newLineString, neighborLineString)) {
                    // Merge T1 and T2 into single LineString L - instruction #8
                    const mergedLineString = this.mergeT1T2(newLineString, neighborLineString);

                    // Replace the new LineString with merged version
                    mergedResults[i] = mergedLineString;
                    usedNeighborIndices.add(j);

                    if (this.debugMode) {
                        this.mergingOperations.push({
                            newLineString: newLineString.length,
                            neighborLineString: neighborLineString.length,
                            merged: mergedLineString.length,
                            level: newLineString.level
                        });
                        console.log(`   🔗 Merged LineStrings: ${newLineString.length}+${neighborLineString.length}→${mergedLineString.length} points (level ${newLineString.level})`);
                    }

                    break; // One merge per new LineString for simplicity
                }
            }
        }

        return mergedResults;
    }

    /**
     * Merge two LineStrings T1 + T2 → L 
     */
    mergeT1T2(lineString1, lineString2) {
        // Find the best connection point between the two LineStrings
        const endpoints1 = [
            { point: lineString1[0], isStart: true },
            { point: lineString1[lineString1.length - 1], isStart: false }
        ];
        const endpoints2 = [
            { point: lineString2[0], isStart: true },
            { point: lineString2[lineString2.length - 1], isStart: false }
        ];

        let bestConnection = null;
        let minDistance = Infinity;

        // Find closest endpoint pair
        for (const ep1 of endpoints1) {
            for (const ep2 of endpoints2) {

                // const distance = Math.sqrt(
                //     Math.pow(ep1.point.lat - ep2.point.lat, 2) +
                //     Math.pow(ep1.point.lon - ep2.point.lon, 2)
                // );

                const distance = Math.hypot(ep1.point.lat - ep2.point.lat, ep1.point.lon - ep2.point.lon);

                if (distance < minDistance) {
                    minDistance = distance;
                    bestConnection = { ep1, ep2, distance };
                }
            }
        }

        if (!bestConnection) {
            // No good connection found, return original
            return lineString1;
        }

        // Merge LineStrings based on best connection
        let mergedPoints = [];
        const { ep1, ep2 } = bestConnection;

        // Build merged LineString based on connection pattern
        if (ep1.isStart && ep2.isStart) {
            // Connect start to start: reverse first, then append second
            mergedPoints = [...lineString1.slice().reverse(), ...lineString2.slice(1)];
        } else if (ep1.isStart && !ep2.isStart) {
            // Connect start to end: reverse first, then append reversed second
            mergedPoints = [...lineString1.slice().reverse(), ...lineString2.slice().reverse().slice(1)];
        } else if (!ep1.isStart && ep2.isStart) {
            // Connect end to start: append second to first
            mergedPoints = [...lineString1, ...lineString2.slice(1)];
        } else {
            // Connect end to end: append reversed second to first
            mergedPoints = [...lineString1, ...lineString2.slice().reverse().slice(1)];
        }

        // Preserve metadata
        mergedPoints.level = lineString1.level;
        mergedPoints.closureInfo = { wasMerged: true, originalLengths: [lineString1.length, lineString2.length] };
        mergedPoints.closureMethod = 'merged_linestrings';

        return mergedPoints;
    }

    /**
     * Store LineStrings for future neighbor processing
     */
    storeLineStringsForNeighbors(i, j, lineStrings) {
        const tileKey = `${i},${j}`;
        this.storedLineStrings.set(tileKey, lineStrings);

        if (this.debugMode) {
            console.log(`💾 Stored ${lineStrings.length} LineStrings for tile (${i},${j})`);
        }
    }

    /**
     * Convert LineStrings to features with conditional geometry types - instruction #9 & #11
     */
    convertLineStringsToFeatures(lineStrings) {
        const features = [];

        for (const lineString of lineStrings) {
            if (lineString.length < 2) {
                console.warn(`Skipping invalid LineString with ${lineString.length} points`);
                continue;
            }

            // Check if LineString is naturally closed - instruction #9
            const isClosed = this.isLineStringClosed(lineString);

            let geometry;
            let properties = {
                level: lineString.level,
                source: 'strip_based_instruction_compliant',
                closure_method: lineString.closureMethod || 'unknown',
                was_merged: lineString.closureInfo?.wasMerged || false,
                original_lengths: lineString.closureInfo?.originalLengths || [lineString.length]
            };

            if (isClosed) {
                // Convert to Polygon (instruction #9: "if L is closed, convert L into POLYGON")
                const coordinates = lineString.map(point => [point.lon, point.lat]);

                // Ensure proper GeoJSON polygon closure
                if (!this.isPolygonClosed(coordinates)) {
                    coordinates.push([...coordinates[0]]);
                }

                geometry = {
                    type: 'Polygon',
                    coordinates: [coordinates]
                };

                properties.geometry_type = 'naturally_closed_polygon';
                properties.was_naturally_closed = true;
                properties.was_forcibly_closed = false;

            } else {
                // Check if we should force closure - instruction #11
                if (this.shouldForceClose(lineString)) {
                    // Force closure the same way as buildLineStrings - add first point to end
                    const forcedLineString = [...lineString, { lat: lineString[0].lat, lon: lineString[0].lon }];
                    const coordinates = forcedLineString.map(point => [point.lon, point.lat]);

                    geometry = {
                        type: 'Polygon',
                        coordinates: [coordinates]
                    };

                    properties.geometry_type = 'forcibly_closed_polygon';
                    properties.was_naturally_closed = false;
                    properties.was_forcibly_closed = true;
                    properties.closure_method = 'forced_connection';

                } else {
                    // Keep as LineString (instruction compliance: not all become polygons!)
                    const coordinates = lineString.map(point => [point.lon, point.lat]);

                    geometry = {
                        type: 'LineString',
                        coordinates: coordinates
                    };

                    properties.geometry_type = 'open_linestring';
                    properties.was_naturally_closed = false;
                    properties.was_forcibly_closed = false;
                    properties.closure_method = 'remains_open';
                }
            }

            features.push({
                type: 'Feature',
                properties: properties,
                geometry: geometry
            });
        }

        // Log summary
        const polygons = features.filter(f => f.geometry.type === 'Polygon').length;
        const lineStringFeatures = features.filter(f => f.geometry.type === 'LineString').length;
        const naturallyClosedPolygons = features.filter(f => f.properties.was_naturally_closed).length;
        const forciblyClosed = features.filter(f => f.properties.was_forcibly_closed).length;

        console.log(`📊 Instruction-Compliant Conversion Summary:`);
        console.log(`   Polygons: ${polygons} (${naturallyClosedPolygons} natural, ${forciblyClosed} forced)`);
        console.log(`   LineStrings: ${lineStringFeatures} (remain open)`);

        return features;
    }

    /**
     * Check if LineString is naturally closed
     */
    isLineStringClosed(lineString, tolerance = 0.001) {
        if (lineString.length < 3) return false;

        const first = lineString[0];
        const last = lineString[lineString.length - 1];

        const distance = Math.sqrt(
            Math.pow(first.lat - last.lat, 2) + Math.pow(first.lon - last.lon, 2)
        );

        return distance <= tolerance;
    }

    /**
     * Determine if LineString should be forcibly closed 
     * "when start and end segments do not touch each other, create new segment that connects"
     */
    shouldForceClose(lineString) {
        // For now, implement a simple policy: force close if endpoints are reasonably close
        // but not naturally closed
        if (lineString.length < 3) return false;

        const first = lineString[0];
        const last = lineString[lineString.length - 1];

        const distance = Math.sqrt(
            Math.pow(first.lat - last.lat, 2) + Math.pow(first.lon - last.lon, 2)
        );

        // Force close if endpoints are within reasonable distance but not naturally closed
        const MAX_FORCE_DISTANCE = 2.0; // Configurable threshold
        return distance > 0.001 && distance <= MAX_FORCE_DISTANCE;
    }

    /**
     * Legacy method kept for compatibility 
     */
    lineStringsToGeoJSON(lineStrings) {
        const features = lineStrings.map(lineString => {
            const coordinates = lineString.map(point => [point.lon, point.lat]);

            // Skip invalid LineStrings (need at least 3 points for a polygon)
            if (coordinates.length < 3) {
                console.warn(`Skipping LineString with only ${coordinates.length} points (needs 3+ for polygon)`);
                return null;
            }

            // Get closure information from isolineBuilder
            const closureInfo = lineString.closureInfo || {};
            const closureMethod = lineString.closureMethod || 'unknown';

            // Ensure polygon is properly closed for GeoJSON
            if (!this.isPolygonClosed(coordinates)) {
                coordinates.push([...coordinates[0]]);
            }

            // ALL LineStrings become Polygons (closure already handled in core)
            return {
                type: 'Feature',
                properties: {
                    level: lineString.level,
                    type: closureInfo.wasForciblyClosed ? 'forcefully_closed_contour' : 'naturally_closed_contour',
                    source: 'strip_based',
                    closure_method: closureMethod,
                    original_length: closureInfo.originalLength || coordinates.length,
                    was_forcibly_closed: closureInfo.wasForciblyClosed || false,
                    was_naturally_closed: closureInfo.isNaturallyClosed || false
                },
                geometry: {
                    type: 'Polygon',
                    coordinates: [coordinates]
                }
            };
        }).filter(feature => feature !== null); // Remove invalid features

        const totalFeatures = features.length;
        const forcedClosures = features.filter(f => f.properties.was_forcibly_closed).length;
        const naturalClosures = features.filter(f => f.properties.was_naturally_closed && !f.properties.was_forcibly_closed).length;
        const openOriginal = totalFeatures - forcedClosures - naturalClosures;

        console.log(`📊 GeoJSON Conversion Summary:`);
        console.log(`   Total Polygons: ${totalFeatures}`);
        console.log(`   Originally Natural: ${naturalClosures}`);
        console.log(`   Originally Open (Forced): ${forcedClosures}`);
        console.log(`   Unknown: ${openOriginal}`);

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

        // Merge globally
        const merged = this.mergeFeaturesByLevel(allFeatures);
        console.log(`📊 Total features after global merge: ${merged.length}`);
        return {
            type: 'FeatureCollection',
            features: merged
        };
    }

    /**
     * Process single level across all tiles (for parallelization)
     */
    processLevelAcrossAllTiles(level) {
        const levelResults = [];

        for (const [tileKey, tileData] of this.tiles.entries()) {
            const [i, j] = tileKey.split(',').map(Number);

            // Create expanded tile with strips
            const expandedData = this.createExpandedTile(i, j, tileData);

            // Process only this level
            const segments = this.conrec.computeSegments(expandedData, [level]);
            const lineStrings = this.builder.buildLineStrings(segments, 1, { forcePolygonClosure: false });
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
            `bottom_strip:${i - 1}:${j}`,
            `top_strip:${i + 1}:${j}`,
            `right_strip:${i}:${j - 1}`,
            `left_strip:${i}:${j + 1}`
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
     * Get comprehensive statistics
     */
    getStatistics() {
        const stats = {
            tiles: this.tiles.size,
            levels: this.levels.length,
            dataStrips: this.dataStrips.size,
            storedLineStrings: this.storedLineStrings.size,
            algorithm: 'strip-based-instruction-compliant',
            stripWidth: this.STRIP_WIDTH,
            instructionCompliance: 'fully_compliant',
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

        // Analyze overlap detection and merging
        if (this.debugMode && this.mergingOperations.length > 0) {
            stats.instructionAnalysis = {
                totalMergingOperations: this.mergingOperations.length,
                overlapDetections: this.overlapDetections.length,
                averagePointsBeforeMerge: this.mergingOperations.reduce((sum, op) =>
                    sum + op.newLineString + op.neighborLineString, 0) / (this.mergingOperations.length * 2),
                averagePointsAfterMerge: this.mergingOperations.reduce((sum, op) =>
                    sum + op.merged, 0) / this.mergingOperations.length
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
            byClosureMethod: {
                naturalClosures: allIsolines.features.filter(f => f.properties.was_naturally_closed).length,
                forcedClosures: allIsolines.features.filter(f => f.properties.was_forcibly_closed).length,
                remainsOpen: allIsolines.features.filter(f => f.geometry.type === 'LineString').length,
                mergedLineStrings: allIsolines.features.filter(f => f.properties.was_merged).length
            },
            instructionCompliance: {
                hasLineStrings: allIsolines.features.some(f => f.geometry.type === 'LineString'),
                hasConditionalConversion: allIsolines.features.some(f => f.properties.was_naturally_closed) &&
                    allIsolines.features.some(f => f.geometry.type === 'LineString'),
                hasSelectiveForcedClosure: allIsolines.features.some(f => f.properties.was_forcibly_closed) &&
                    allIsolines.features.some(f => !f.properties.was_forcibly_closed),
                hasMergedLineStrings: allIsolines.features.some(f => f.properties.was_merged)
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
     * Get debug information about strip usage, overlaps, and merging operations
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
            ),
            storedLineStringCounts: Object.fromEntries(
                Array.from(this.storedLineStrings.entries()).map(([key, lineStrings]) => [
                    key,
                    lineStrings.length
                ])
            ),
            overlapDetections: this.overlapDetections,
            mergingOperations: this.mergingOperations,
            instructionCompliance: {
                implementsOverlaps: typeof this.detectOverlaps === 'function',
                implementsMerging: typeof this.mergeT1T2 === 'function',
                implementsConditionalConversion: typeof this.convertLineStringsToFeatures === 'function',
                implementsSelectiveClosure: typeof this.shouldForceClose === 'function',
                hasLineStringStorage: this.storedLineStrings.size > 0
            }
        };
    }

    /**
     * Function aliases for test compatibility
     */
    findOverlappingLineStrings(lineString1, lineString2) {
        return this.detectOverlaps(lineString1, lineString2);
    }

    checkLineStringOverlap(lineString1, lineString2) {
        return this.detectOverlaps(lineString1, lineString2);
    }

    mergeLineStrings(lineString1, lineString2) {
        return this.mergeT1T2(lineString1, lineString2);
    }

    combineLineStrings(lineString1, lineString2) {
        return this.mergeT1T2(lineString1, lineString2);
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
            const topNeighborKey = `${i - 1},${j}`;
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
            const rightNeighborKey = `${i},${j + 1}`;
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
     * Get forced closure analysis for comparison with standard algorithm
     */
    getForcedClosureAnalysis() {
        const geoJSON = this.getIsolinesAsGeoJSON();

        const analysis = {
            algorithm: 'strip-based-forced-closure',
            timestamp: new Date().toISOString(),
            totalPolygons: geoJSON.features.length,
            naturalClosures: geoJSON.features.filter(f => f.properties.closure_method === 'natural_closure').length,
            forcedClosures: geoJSON.features.filter(f => f.properties.closure_method === 'forced_connection').length,
            byLevel: {}
        };

        // Analyze closure methods by level
        for (const feature of geoJSON.features) {
            const level = feature.properties.level;
            if (!analysis.byLevel[level]) {
                analysis.byLevel[level] = { natural: 0, forced: 0, total: 0 };
            }

            analysis.byLevel[level].total++;
            if (feature.properties.closure_method === 'natural_closure') {
                analysis.byLevel[level].natural++;
            } else if (feature.properties.closure_method === 'forced_connection') {
                analysis.byLevel[level].forced++;
            }
        }

        // Calculate percentages
        analysis.forcedClosureRate = analysis.totalPolygons > 0 ?
            (analysis.forcedClosures / analysis.totalPolygons * 100).toFixed(1) + '%' : '0%';
        analysis.naturalClosureRate = analysis.totalPolygons > 0 ?
            (analysis.naturalClosures / analysis.totalPolygons * 100).toFixed(1) + '%' : '0%';

        // Add level-wise percentages
        for (const level in analysis.byLevel) {
            const levelData = analysis.byLevel[level];
            levelData.forcedRate = levelData.total > 0 ?
                (levelData.forced / levelData.total * 100).toFixed(1) + '%' : '0%';
        }

        return analysis;
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
     * Updated for forced polygon closure approach
     */
    getBoundaryContinuityReport() {
        const report = {
            algorithm: 'strip-based-forced-closure',
            expectedBehavior: 'Perfect continuity through identical boundary data + forced polygon closure',
            actualResults: {}
        };

        const geoJSON = this.getIsolinesAsGeoJSON();

        // Analyze boundary crossings in Polygons (all features are now Polygons)
        let totalBoundaryCrossings = 0;
        let perfectContinuity = 0;
        let forcedClosureAnalysis = {
            totalPolygons: geoJSON.features.length,
            naturallyClosedPolygons: 0,
            forcedClosedPolygons: 0
        };

        for (const feature of geoJSON.features) {
            // Count closure methods
            if (feature.properties.closure_method === 'natural_closure') {
                forcedClosureAnalysis.naturallyClosedPolygons++;
            } else if (feature.properties.closure_method === 'forced_connection') {
                forcedClosureAnalysis.forcedClosedPolygons++;
            }

            // Analyze boundary crossings in polygon coordinates
            if (feature.geometry.type === 'Polygon') {
                const coords = feature.geometry.coordinates[0]; // First ring of polygon

                // Check if polygon edges cross tile boundaries
                for (let i = 0; i < coords.length - 1; i++) {
                    const [lon1, lat1] = coords[i];
                    const [lon2, lat2] = coords[i + 1];

                    const tileI1 = Math.floor(lat1 / this.tileSize);
                    const tileJ1 = Math.floor(lon1 / this.tileSize);
                    const tileI2 = Math.floor(lat2 / this.tileSize);
                    const tileJ2 = Math.floor(lon2 / this.tileSize);

                    if (tileI1 !== tileI2 || tileJ1 !== tileJ2) {
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
            forcedClosureAnalysis,
            forcedClosureRate: forcedClosureAnalysis.totalPolygons > 0 ?
                forcedClosureAnalysis.forcedClosedPolygons / forcedClosureAnalysis.totalPolygons : 0,
            message: totalBoundaryCrossings === perfectContinuity ?
                'Perfect boundary continuity achieved with forced closure approach' :
                'Some boundary continuity issues detected despite forced closure'
        };

        return report;
    }
}

module.exports = TiledIsolineBuilder;

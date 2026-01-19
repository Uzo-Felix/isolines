const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

// Import new algorithm structure
const {
    StandardIsolineGenerator,
    TiledAlgorithms
} = require('../../algorithms');


const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

/**
 * Parse JSON array input
 */
function parseInputValues(input) {
    try {
        return JSON.parse(input);
    } catch (error) {
        console.error('Invalid input. Please provide a valid JSON array of values.');
        process.exit(1);
    }
}

/**
 * Process CSV file to match HTML version exactly
 */
function processCSVLikeHTML(filePath, options = {}) {
    return new Promise((resolve, reject) => {
        console.log(`Processing CSV file: ${filePath}`);

        let rowCount = 0;
        let grid = [];
        let isFirstRowHeader = false;
        let isFirstChunk = true;

        const fileStream = fs.createReadStream(filePath);

        Papa.parse(fileStream, {
            worker: false,
            skipEmptyLines: true,
            dynamicTyping: true,
            chunk: function (results, parser) {
                let chunkData = results.data;

                if (isFirstChunk && chunkData.length > 0) {
                    const firstRow = chunkData[0];
                    isFirstRowHeader = firstRow && firstRow.some((val) =>
                        typeof val === "string" && isNaN(Number(val))
                    );

                    if (isFirstRowHeader) {
                        console.log("First row appears to be headers, skipping it");
                        chunkData = chunkData.slice(1);
                    }
                    isFirstChunk = false;
                }

                const convertedData = chunkData.map((row) =>
                    row.map((val) => {
                        if (typeof val === "number") return val;
                        if (typeof val === "string") {
                            const num = Number(val.replace(/,/g, "."));
                            return isNaN(num) ? NaN : num;
                        }
                        return NaN;
                    })
                );

                const numericData = convertedData
                    .filter((row) => row.length > 0 && row.some((val) => !isNaN(val)))
                    .map((row) => row.map((val) => isNaN(val) ? 0 : val));

                grid = grid.concat(numericData);
                rowCount += numericData.length;

                console.log(`Processed ${rowCount} rows...`);
            },
            complete: function () {
                console.log(`CSV processing complete. Total rows: ${rowCount}`);

                if (grid.length === 0 || grid[0].length === 0) {
                    reject(new Error("No valid numeric data found in CSV"));
                    return;
                }

                console.log(`Dataset size: ${grid[0].length}x${grid.length} (${grid.length * grid[0].length} values)`);

                resolve({
                    grid: grid,
                    width: grid[0].length,
                    height: grid.length
                });
            },
            error: function (error) {
                reject(error);
            }
        });
    });
}

/**
 * Downsample grid exactly like HTML version
 */
function downsampleGrid(grid, factor) {
    if (factor <= 1) return grid;

    const rows = grid.length;
    const cols = grid[0].length;
    const newRows = Math.ceil(rows / factor);
    const newCols = Math.ceil(cols / factor);
    const result = [];

    console.log(`Downsampling from ${cols}x${rows} to ${newCols}x${newRows} (factor: ${factor})`);

    for (let i = 0; i < newRows; i++) {
        const row = [];
        for (let j = 0; j < newCols; j++) {
            let sum = 0;
            let count = 0;

            for (let di = 0; di < factor; di++) {
                for (let dj = 0; dj < factor; dj++) {
                    const ri = i * factor + di;
                    const cj = j * factor + dj;

                    if (ri < rows && cj < cols) {
                        sum += grid[ri][cj];
                        count++;
                    }
                }
            }

            row.push(count > 0 ? sum / count : 0);
        }
        result.push(row);
    }

    return result;
}

/**
 * Calculate contour levels exactly like HTML version
 */
function calculateLevelsLikeHTML(grid, numLevels) {
    const flatData = grid.flat().filter((val) => !isNaN(val));

    if (flatData.length === 0) {
        throw new Error("No valid data for level calculation");
    }

    const min = Math.min(...flatData);
    const max = Math.max(...flatData);
    const range = max - min;
    const step = range / numLevels;

    const levels = Array.from({ length: numLevels }, (_, i) => min + (i + 0.5) * step);

    console.log(`Value range: ${min.toFixed(3)} to ${max.toFixed(3)}`);
    console.log(`Generated ${levels.length} levels:`, levels.map(l => l.toFixed(3)));

    return levels;
}

/**
 * Generate isolines using standard (non-tiled) approach
 * Now uses new algorithm structure
 */
function generateStandardIsolines(grid, levels) {
    console.log('Generating standard isolines...');

    const generator = new StandardIsolineGenerator(levels);
    const isolines = generator.generateIsolines(grid);

    console.log(`Built ${isolines.length} isolines`);

    return isolines;
}

/**
 * Generate isolines using tiled approach
 * Now supports algorithm selection
 */
function generateTiledIsolines(grid, levels, options = {}) {
    const algorithm = options.algorithm || 'linestring';
    const tileSize = options.tileSize || 64;

    console.log(`Generating tiled isolines using ${algorithm} algorithm...`);

    // Use new tiled algorithms
    const tiledGeoJSON = TiledAlgorithms.generateTiledIsolines(grid, levels, {
        algorithm: algorithm,
        tileSize: tileSize,
        ...options
    });

    console.log(`Built ${tiledGeoJSON.features.length} tiled isolines`);

    return tiledGeoJSON;
}

/**
 * Convert tiled isolines GeoJSON to match standard format
 */
function normalizeTiledGeoJSON(tiledGeoJSON, scaleFactor = 1000) {
    const scaledFeatures = tiledGeoJSON.features.map(feature => ({
        ...feature,
        geometry: {
            ...feature.geometry,
            coordinates: feature.geometry.type === 'Polygon'
                ? [feature.geometry.coordinates[0].map(coord => [coord[0] / scaleFactor, coord[1] / scaleFactor])]
                : feature.geometry.coordinates.map(coord => [coord[0] / scaleFactor, coord[1] / scaleFactor])
        }
    }));

    return {
        type: 'FeatureCollection',
        features: scaledFeatures
    };
}

/**
 * Convert isolines to GeoJSON without forced closure
 */
function isolinesToGeoJSON(isolines, scaleFactor = 1000) {
    const features = isolines.map((isoline) => {
        const coordinates = isoline.map((point) => {
            const lon = point.lon / scaleFactor;
            const lat = point.lat / scaleFactor;
            // Normalize longitude
            // while (lon > 180) lon -= 360;
            // while (lon < -180) lon += 360;

            return [lon, lat];
        });

        // Check if naturally closed
        const isClosed = coordinates.length > 0 &&
            coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
            coordinates[0][1] === coordinates[coordinates.length - 1][1];

        // Use LineString for open chains, Polygon for closed chains
        const geometryType = isClosed ? 'Polygon' : 'LineString';
        const geometryCoordinates = isClosed ? [coordinates] : coordinates;

        return {
            type: "Feature",
            properties: {
                level: isoline.level,
                algorithm: 'standard',
                closed: isClosed
            },
            geometry: {
                type: geometryType,
                coordinates: geometryCoordinates
            }
        };
    }).filter((feature) => {
        const coords = feature.geometry.type === 'Polygon'
            ? feature.geometry.coordinates[0]
            : feature.geometry.coordinates;
        return coords.length >= 2 &&
            coords.every((coord) =>
                !isNaN(coord[0]) && !isNaN(coord[1])
            );
    });

    return {
        type: "FeatureCollection",
        features: features
    };
}

/**
 * Main processing function
 */
async function processFile(inputPath, options = {}) {
    const config = {
        downsampleFactor: options.downsampleFactor || 8,
        numLevels: options.numLevels || 5,
        useTiled: options.useTiled || false,
        algorithm: options.algorithm || 'linestring', // NEW: algorithm selection
        tileSize: options.tileSize || 64,
        scaleFactor: options.scaleFactor || 1000,
        saveIntermediates: options.saveIntermediates || false,
        ...options
    };

    console.log('=== Processing Configuration ===');
    console.log(`Downsample Factor: ${config.downsampleFactor}`);
    console.log(`Number of Levels: ${config.numLevels}`);
    console.log(`Algorithm: ${config.useTiled ? `Tiled (${config.algorithm})` : 'Standard'}`);
    if (config.useTiled) {
        console.log(`Tile Size: ${config.tileSize}`);
    }
    console.log(`Scale Factor: ${config.scaleFactor}`);
    console.log('================================\n');

    const startTime = Date.now();

    try {
        const csvResult = await processCSVLikeHTML(inputPath, config);
        const downsampledGrid = downsampleGrid(csvResult.grid, config.downsampleFactor);
        const levels = calculateLevelsLikeHTML(downsampledGrid, config.numLevels);

        let geojson;
        if (config.useTiled) {
            const tiledGeoJSON = generateTiledIsolines(downsampledGrid, levels, config);
            geojson = normalizeTiledGeoJSON(tiledGeoJSON, config.scaleFactor);
        } else {
            const standardIsolines = generateStandardIsolines(downsampledGrid, levels);
            geojson = isolinesToGeoJSON(standardIsolines, config.scaleFactor);
        }

        const endTime = Date.now();

        // Save results with algorithm name
        const algorithmSuffix = config.useTiled ? `tiled-${config.algorithm}` : 'standard';
        const outputPath = path.join(outputDir, `isolines-${algorithmSuffix}.geojson`);
        fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));

        // Save metadata
        const metadataPath = path.join(outputDir, `isolines-${algorithmSuffix}-metadata.json`);
        const metadata = {
            originalFile: inputPath,
            processedAt: new Date().toISOString(),
            algorithm: config.useTiled ? `tiled-${config.algorithm}` : 'standard',
            configuration: config,
            originalDimensions: {
                width: csvResult.width,
                height: csvResult.height,
                totalValues: csvResult.width * csvResult.height
            },
            processedDimensions: {
                width: downsampledGrid[0].length,
                height: downsampledGrid.length,
                totalValues: downsampledGrid[0].length * downsampledGrid.length
            },
            levels: levels,
            results: {
                featureCount: geojson.features.length,
                processingTimeMs: (endTime - startTime),
                processingTimeSeconds: ((endTime - startTime) / 1000).toFixed(2)
            }
        };

        if (config.useTiled) {
            metadata.tiling = {
                algorithm: config.algorithm,
                tileSize: config.tileSize,
                tilesX: Math.ceil(downsampledGrid[0].length / config.tileSize),
                tilesY: Math.ceil(downsampledGrid.length / config.tileSize)
            };
        }

        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        console.log('\n=== PROCESSING COMPLETE ===');
        console.log(`Algorithm: ${config.useTiled ? `Tiled (${config.algorithm})` : 'Standard'}`);
        console.log(`Generated: ${geojson.features.length} isoline features`);
        console.log(`Processing time: ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
        console.log(`Output: ${outputPath}`);
        console.log(`Metadata: ${metadataPath}`);

        return {
            geojson,
            metadata,
            outputPath,
            metadataPath
        };

    } catch (error) {
        console.error('Processing failed:', error.message);
        throw error;
    }
}

/**
 * Generate all tiled algorithms for comparison
 */
async function generateAllTiledVersions(inputPath, options = {}) {
    console.log('=== GENERATING ALL TILED ALGORITHMS ===\n');

    const baseConfig = {
        downsampleFactor: options.downsampleFactor || 4,
        numLevels: options.numLevels || 10,
        tileSize: options.tileSize || 64,
        scaleFactor: options.scaleFactor || 1000,
        ...options
    };

    const algorithms = ['linestring', 'polygon', 'strip', 'overlapping'];
    const results = {};

    try {
        // Generate standard version first
        console.log('>>> GENERATING STANDARD VERSION <<<');
        const standardResult = await processFile(inputPath, {
            ...baseConfig,
            useTiled: false
        });
        results.standard = standardResult;

        // Generate each tiled algorithm
        for (const algorithm of algorithms) {
            console.log(`\n>>> GENERATING TILED-${algorithm.toUpperCase()} VERSION <<<`);
            try {
                const tiledResult = await processFile(inputPath, {
                    ...baseConfig,
                    useTiled: true,
                    algorithm: algorithm
                });
                results[`tiled-${algorithm}`] = tiledResult;
            } catch (error) {
                console.error(`Failed to generate ${algorithm} algorithm:`, error.message);
                results[`tiled-${algorithm}`] = {
                    error: error.message,
                    algorithm: `tiled-${algorithm}`
                };
            }
        }

        // Create comprehensive comparison metadata
        const comparisonPath = path.join(outputDir, 'all-algorithms-comparison.json');
        const comparison = {
            generatedAt: new Date().toISOString(),
            inputFile: inputPath,
            configuration: baseConfig,
            results: {}
        };

        // Process results for comparison
        for (const [algName, result] of Object.entries(results)) {
            if (result.error) {
                comparison.results[algName] = {
                    success: false,
                    error: result.error
                };
            } else {
                comparison.results[algName] = {
                    success: true,
                    features: result.geojson.features.length,
                    processingTime: result.metadata.results.processingTimeMs,
                    outputPath: result.outputPath,
                    algorithm: result.metadata.algorithm
                };

                if (result.metadata.tiling) {
                    comparison.results[algName].tiling = result.metadata.tiling;
                }
            }
        }

        // Generate comparison statistics
        const successful = Object.entries(comparison.results).filter(([_, result]) => result.success);
        if (successful.length > 1) {
            const standardFeatures = comparison.results.standard?.features || 0;

            comparison.statistics = {
                totalAlgorithms: Object.keys(comparison.results).length,
                successfulAlgorithms: successful.length,
                standardFeatures: standardFeatures,
                tiledAlgorithms: {}
            };

            // Compare each tiled algorithm to standard
            for (const [algName, result] of successful) {
                if (algName.startsWith('tiled-')) {
                    const featureDiff = result.features - standardFeatures;
                    const percentDiff = standardFeatures > 0 ?
                        ((featureDiff / standardFeatures) * 100).toFixed(1) : 'N/A';

                    comparison.statistics.tiledAlgorithms[algName] = {
                        features: result.features,
                        featureDifference: featureDiff,
                        percentageDifference: percentDiff,
                        processingTime: result.processingTime,
                        speedVsStandard: comparison.results.standard?.processingTime ?
                            (comparison.results.standard.processingTime / result.processingTime).toFixed(2) + 'x' : 'N/A'
                    };
                }
            }
        }

        fs.writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2));

        console.log('\n=== ALL ALGORITHMS COMPARISON SUMMARY ===');
        console.log(`Total algorithms tested: ${Object.keys(results).length}`);
        console.log(`Successful: ${successful.length}`);

        if (comparison.statistics) {
            console.log(`\nFeature Comparison (vs Standard: ${comparison.statistics.standardFeatures}):`);
            for (const [algName, stats] of Object.entries(comparison.statistics.tiledAlgorithms)) {
                console.log(`  ${algName}: ${stats.features} features (${stats.percentageDifference}%)`);
            }
        }

        console.log(`\nComparison data saved: ${comparisonPath}`);

        return {
            results,
            comparison,
            comparisonPath
        };

    } catch (error) {
        console.error('All algorithms comparison failed:', error.message);
        throw error;
    }
}

/**
 * Generate both standard and tiled versions for comparison (updated)
 */
async function generateBothVersions(inputPath, options = {}) {
    console.log('=== GENERATING STANDARD + TILED COMPARISON ===\n');

    const baseConfig = {
        downsampleFactor: options.downsampleFactor || 4,
        numLevels: options.numLevels || 10,
        algorithm: options.algorithm || 'linestring', // Allow algorithm selection
        tileSize: options.tileSize || 64,
        scaleFactor: options.scaleFactor || 1000,
        ...options
    };

    try {
        // Generate standard version
        console.log('>>> GENERATING STANDARD VERSION <<<');
        const standardResult = await processFile(inputPath, {
            ...baseConfig,
            useTiled: false
        });

        console.log(`\n>>> GENERATING TILED VERSION (${baseConfig.algorithm}) <<<`);
        const tiledResult = await processFile(inputPath, {
            ...baseConfig,
            useTiled: true
        });

        // Create comparison metadata
        const comparisonPath = path.join(outputDir, `comparison-standard-vs-tiled-${baseConfig.algorithm}.json`);
        const comparison = {
            generatedAt: new Date().toISOString(),
            inputFile: inputPath,
            configuration: baseConfig,
            standard: {
                features: standardResult.geojson.features.length,
                processingTime: standardResult.metadata.results.processingTimeMs,
                outputPath: standardResult.outputPath
            },
            tiled: {
                features: tiledResult.geojson.features.length,
                processingTime: tiledResult.metadata.results.processingTimeMs,
                outputPath: tiledResult.outputPath,
                algorithm: baseConfig.algorithm,
                tiling: tiledResult.metadata.tiling
            },
            comparison: {
                featureDifference: tiledResult.geojson.features.length - standardResult.geojson.features.length,
                percentageDifference: ((tiledResult.geojson.features.length - standardResult.geojson.features.length) / standardResult.geojson.features.length * 100).toFixed(1),
                speedupFactor: (standardResult.metadata.results.processingTimeMs / tiledResult.metadata.results.processingTimeMs).toFixed(2),
                fasterAlgorithm: tiledResult.metadata.results.processingTimeMs < standardResult.metadata.results.processingTimeMs ? 'tiled' : 'standard'
            }
        };

        fs.writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2));

        console.log('\n=== COMPARISON SUMMARY ===');
        console.log(`Standard Features: ${comparison.standard.features}`);
        console.log(`Tiled Features: ${comparison.tiled.features} (${baseConfig.algorithm})`);
        console.log(`Feature Difference: ${comparison.comparison.featureDifference} (${comparison.comparison.percentageDifference}%)`);
        console.log(`Standard Time: ${(comparison.standard.processingTime / 1000).toFixed(2)}s`);
        console.log(`Tiled Time: ${(comparison.tiled.processingTime / 1000).toFixed(2)}s`);
        console.log(`Speed Factor: ${comparison.comparison.speedupFactor}x`);
        console.log(`Comparison Data: ${comparisonPath}`);

        return {
            standard: standardResult,
            tiled: tiledResult,
            comparison
        };

    } catch (error) {
        console.error('Comparison generation failed:', error.message);
        throw error;
    }
}

/**
 * Simulate WMTS tile-by-tile arrival for tiled processing
 */
async function simulateWMTSTileArrival(inputPath, options = {}) {
    console.log('=== WMTS TILE ARRIVAL SIMULATION ===\n');

    const config = {
        downsampleFactor: options.downsampleFactor || 4,
        numLevels: options.numLevels || 10,
        algorithm: options.algorithm || 'linestring', // Allow algorithm selection
        tileSize: options.tileSize || 64,
        scaleFactor: options.scaleFactor || 1000,
        randomOrder: options.randomOrder || false,
        simulateDelay: options.simulateDelay || false,
        saveIntermediates: true,
        ...options
    };

    try {
        const csvResult = await processCSVLikeHTML(inputPath, config);
        const downsampledGrid = downsampleGrid(csvResult.grid, config.downsampleFactor);
        const levels = calculateLevelsLikeHTML(downsampledGrid, config.numLevels);

        const height = downsampledGrid.length;
        const width = downsampledGrid[0].length;
        const tilesX = Math.ceil(width / config.tileSize);
        const tilesY = Math.ceil(height / config.tileSize);

        console.log(`Simulating ${tilesX}x${tilesY} tiles arriving in ${config.randomOrder ? 'random' : 'sequential'} order`);
        console.log(`Using ${config.algorithm} algorithm`);

        const builder = TiledAlgorithms.createTiledBuilder(config.algorithm, levels, config.tileSize);
        const wmtsDir = path.join(outputDir, `wmts_simulation_${config.algorithm}`);

        if (!fs.existsSync(wmtsDir)) {
            fs.mkdirSync(wmtsDir, { recursive: true });
        }

        // Generate tile order
        let tileOrder = [];
        for (let y = 0; y < tilesY; y++) {
            for (let x = 0; x < tilesX; x++) {
                tileOrder.push([y, x]);
            }
        }

        if (config.randomOrder) {
            for (let i = tileOrder.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tileOrder[i], tileOrder[j]] = [tileOrder[j], tileOrder[i]];
            }
        }

        // Simulate tile arrivals
        for (let tileIndex = 0; tileIndex < tileOrder.length; tileIndex++) {
            const [tileY, tileX] = tileOrder[tileIndex];

            console.log(`Tile (${tileY}, ${tileX}) arrived [${tileIndex + 1}/${tileOrder.length}]`);

            const tileData = extractTileFromGrid(downsampledGrid, width, height, tileX, tileY, config.tileSize);
            builder.addTile(tileY, tileX, tileData);

            const currentIsolines = builder.getIsolinesAsGeoJSON();
            const normalizedIsolines = normalizeTiledGeoJSON(currentIsolines, config.scaleFactor);

            // Save intermediate state
            const statePath = path.join(wmtsDir, `state_after_tile_${String(tileIndex + 1).padStart(3, '0')}.geojson`);
            fs.writeFileSync(statePath, JSON.stringify(normalizedIsolines, null, 2));

            // Create tile visualization
            const tileViz = {
                tileIndex: tileIndex + 1,
                totalTiles: tileOrder.length,
                currentTile: { x: tileX, y: tileY },
                completedTiles: tileOrder.slice(0, tileIndex + 1),
                grid: { width: tilesX, height: tilesY },
                features: normalizedIsolines.features.length,
                levels: levels.length,
                algorithm: config.algorithm
            };

            const vizPath = path.join(wmtsDir, `visualization_${String(tileIndex + 1).padStart(3, '0')}.json`);
            fs.writeFileSync(vizPath, JSON.stringify(tileViz, null, 2));

            if (config.simulateDelay) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Save final summary
        const finalResult = builder.getIsolinesAsGeoJSON();
        const summary = {
            simulation: {
                totalTiles: tileOrder.length,
                orderType: config.randomOrder ? 'random' : 'sequential',
                simulatedDelay: config.simulateDelay,
                algorithm: config.algorithm,
                configuration: config
            },
            finalResults: {
                features: finalResult.features.length,
                levels: levels.length
            },
            outputDirectory: wmtsDir
        };

        const summaryPath = path.join(wmtsDir, 'simulation_summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

        console.log(`\nWMTS simulation complete!`);
        console.log(`Algorithm: ${config.algorithm}`);
        console.log(`Final features: ${summary.finalResults.features}`);
        console.log(`Results saved to: ${wmtsDir}`);

        return summary;

    } catch (error) {
        console.error('WMTS simulation failed:', error.message);
        throw error;
    }
}

/**
 * Extract tile from grid (helper function)
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

/**
 * Command line interface (updated)
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage: node generate-geojson.js <command> <input.csv> [options]');
        console.error('');
        console.error('Commands:');
        console.error('  standard           - Generate standard (non-tiled) isolines');
        console.error('  tiled              - Generate tiled isolines');
        console.error('  both               - Generate both for comparison');
        console.error('  all-tiled          - Generate all tiled algorithms');
        console.error('  wmts               - Simulate WMTS tile arrival');
        console.error('');
        console.error('Tiled Algorithm Options (use in options JSON):');
        console.error('  "algorithm": "linestring" - LineString-based (default)');
        console.error('  "algorithm": "polygon"    - Polygon-based');
        console.error('  "algorithm": "strip"      - Strip-based');
        console.error('  "algorithm": "overlapping" - Overlapping-tile (best equivalence)');
        console.error('');
        console.error('Examples:');
        console.error('  node generate-geojson.js standard data.csv \'{"downsampleFactor":4,"numLevels":10}\'');
        console.error('  node generate-geojson.js tiled data.csv \'{"algorithm":"linestring","tileSize":64}\'');
        console.error('  node generate-geojson.js tiled data.csv \'{"algorithm":"linestring","tileSize":64}\'');
        console.error('  node generate-geojson.js tiled data.csv \'{"algorithm":"polygon","tileSize":64}\'');
        console.error('  node generate-geojson.js tiled data.csv \'{"algorithm":"strip","tileSize":64}\'');
        console.error('  node generate-geojson.js tiled data.csv \'{"algorithm":"overlapping","tileSize":64}\'');
        console.error('  node generate-geojson.js both data.csv \'{"algorithm":"linestring","downsampleFactor":2}\'');
        console.error('  node generate-geojson.js all-tiled data.csv \'{"tileSize":64,"numLevels":15}\'');
        console.error('  node generate-geojson.js wmts data.csv \'{"algorithm":"strip","randomOrder":true}\'');
        process.exit(1);
    }

    const command = args[0];
    const inputPath = args[1];
    const optionsArg = args[2];

    if (!inputPath) {
        console.error('Error: No input file provided.');
        process.exit(1);
    }

    if (!fs.existsSync(inputPath)) {
        console.error(`Error: Input file not found: ${inputPath}`);
        process.exit(1);
    }

    let options = {};
    if (optionsArg) {
        try {
            options = JSON.parse(optionsArg);
        } catch (error) {
            console.error('Invalid options format. Using defaults.');
        }
    }

    try {
        switch (command) {
            case 'standard':
                await processFile(inputPath, { ...options, useTiled: false });
                break;

            case 'tiled':
                await processFile(inputPath, { ...options, useTiled: true });
                break;

            case 'both':
                await generateBothVersions(inputPath, options);
                break;

            case 'all-tiled':
                await generateAllTiledVersions(inputPath, options);
                break;

            case 'wmts':
                await simulateWMTSTileArrival(inputPath, options);
                break;

            default:
                console.error(`Unknown command: ${command}`);
                console.error('Valid commands: standard, tiled, both, all-tiled, wmts');
                process.exit(1);
        }

    } catch (error) {
        console.error('Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Handle JSON array input for backward compatibility
if (require.main === module) {
    const firstArg = process.argv[2];

    // Check if first argument looks like JSON array
    if (firstArg && firstArg.startsWith('[')) {
        console.log('Detected JSON array input - using legacy mode');

        const values = parseInputValues(firstArg);
        const optionsArg = process.argv[3];

        let options = {
            numLevels: 10,
            downsampleFactor: 1,
            useTiled: true,
            algorithm: 'linestring' // Default algorithm
        };

        if (optionsArg) {
            try {
                options = { ...options, ...JSON.parse(optionsArg) };
            } catch (error) {
                console.error('Invalid options format. Using defaults.');
            }
        }

        // Convert array to grid for processing
        const width = options.width || Math.ceil(Math.sqrt(values.length));
        const height = options.height || Math.ceil(values.length / width);

        const grid = [];
        for (let i = 0; i < height; i++) {
            const row = [];
            for (let j = 0; j < width; j++) {
                const index = i * width + j;
                row.push(index < values.length ? values[index] : 0);
            }
            grid.push(row);
        }

        console.log(`Converting array to ${width}x${height} grid`);
        console.log(`Using ${options.useTiled ? `tiled (${options.algorithm})` : 'standard'} algorithm`);

        (async () => {
            try {
                const levels = calculateLevelsLikeHTML(grid, options.numLevels);

                let geojson;
                if (options.useTiled) {
                    const tiledGeoJSON = generateTiledIsolines(grid, levels, options);
                    geojson = normalizeTiledGeoJSON(tiledGeoJSON, options.scaleFactor || 1000);
                } else {
                    const standardIsolines = generateStandardIsolines(grid, levels);
                    geojson = isolinesToGeoJSON(standardIsolines, options.scaleFactor || 1000);
                }

                const algorithmSuffix = options.useTiled ? `tiled-${options.algorithm}` : 'standard';
                const outputPath = path.join(outputDir, `isolines-from-array-${algorithmSuffix}.geojson`);
                fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));

                console.log(`Generated ${geojson.features.length} features using ${algorithmSuffix} algorithm`);
                console.log(`Saved to: ${outputPath}`);

            } catch (error) {
                console.error('Array processing error:', error.message);
                console.error(error.stack);
                process.exit(1);
            }
        })();

    } else {
        // Normal CLI mode
        main().catch(error => {
            console.error('Unhandled error:', error);
            console.error(error.stack);
            process.exit(1);
        });
    }
}

module.exports = {
    processFile,
    generateBothVersions,
    generateAllTiledVersions,
    simulateWMTSTileArrival,
    processCSVLikeHTML,
    downsampleGrid,
    calculateLevelsLikeHTML,
    generateStandardIsolines,
    generateTiledIsolines,
    isolinesToGeoJSON,
    normalizeTiledGeoJSON,
    extractTileFromGrid
};



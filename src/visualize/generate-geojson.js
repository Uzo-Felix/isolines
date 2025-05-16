const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const {
    TiledIsolineBuilder
} = require('../index');

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
 * Process CSV file in chunks
 */
function processCSVInChunks(filePath, options = {}) {
    return new Promise((resolve, reject) => {
        console.log(`Processing CSV file: ${filePath}`);

        const chunkSize = options.chunkSize || 1000; // Number of rows per chunk

        let sampleEvery = options.sampleEvery || 1;

        let rowCount = 0;
        let processedRows = 0;
        let values = [];
        let width = 0;
        let isFirstChunk = true;
        let isFirstRowHeader = false;

        const fileStream = fs.createReadStream(filePath);

        Papa.parse(fileStream, {
            dynamicTyping: true,
            skipEmptyLines: true,
            chunk: function (results, parser) {
                let chunkData = results.data;

                if (isFirstChunk && chunkData.length > 0) {
                    const firstRow = chunkData[0];
                    isFirstRowHeader = firstRow && firstRow.some(val =>
                        typeof val === 'string' && isNaN(Number(val))
                    );

                    if (isFirstRowHeader) {
                        console.log('First row appears to be headers, skipping it');
                        chunkData = chunkData.slice(1);
                    }

                    if (chunkData.length > 0) {
                        width = chunkData[0].length;
                        console.log(`Detected width: ${width}`);

                        const estimatedRows = fs.statSync(filePath).size /
                            (Buffer.from(JSON.stringify(chunkData)).length / chunkData.length);
                        const estimatedTotalValues = estimatedRows * width;

                        if (!options.sampleEvery && estimatedTotalValues > 1000000) {
                            sampleEvery = 4; // Default to sampling every 4 points for large datasets
                            console.log(`Large dataset detected (est. ${Math.round(estimatedTotalValues / 1000000)}M values). Automatically setting sampleEvery=${sampleEvery}`);
                        }
                    }

                    isFirstChunk = false;
                }

                for (let i = 0; i < chunkData.length; i += sampleEvery) {
                    if (i < chunkData.length) {
                        const row = chunkData[i];
                        for (let j = 0; j < row.length; j += sampleEvery) {
                            if (j < row.length) {
                                let val = row[j];
                                if (typeof val === 'string') {
                                    val = Number(val.replace(/,/g, '.'));
                                }
                                if (typeof val === 'number' && !isNaN(val)) {
                                    values.push(val);
                                } else {
                                    values.push(0);
                                }
                            }
                        }
                    }
                }

                rowCount += chunkData.length;
                processedRows += Math.ceil(chunkData.length / sampleEvery);

                console.log(`Processed ${rowCount} rows (${processedRows} after sampling)...`);
            },
            complete: function () {
                console.log(`CSV processing complete. Total rows: ${rowCount}`);
                console.log(`After sampling every ${sampleEvery} points: ${values.length} values`);

                const sampledWidth = Math.ceil(width / sampleEvery);
                const sampledHeight = Math.ceil(rowCount / sampleEvery);

                resolve({
                    values,
                    width: sampledWidth,
                    height: sampledHeight,
                    sampleEvery
                });
            },
            error: function (error) {
                reject(error);
            }
        });
    });
}

/**
 * Extract a tile from the grid
 */
function extractTile(values, width, height, tileX, tileY, tileSize) {
    const tileData = [];

    const startY = tileY * tileSize;
    const endY = Math.min(startY + tileSize, height);
    const startX = tileX * tileSize;
    const endX = Math.min(startX + tileSize, width);

    for (let y = startY; y < endY; y++) {
        const row = [];
        for (let x = startX; x < endX; x++) {
            const index = y * width + x;
            row.push(index < values.length ? values[index] : 0);
        }
        tileData.push(row);
    }

    return tileData;
}

/**
 * Generate a tile processing order (spiral from center)
 */
function generateTileProcessingOrder(tilesX, tilesY) {
    const order = [];
    const centerX = Math.floor(tilesX / 2);
    const centerY = Math.floor(tilesY / 2);

    order.push([centerY, centerX]);

    const visited = new Set();
    visited.add(`${centerY},${centerX}`);

    const directions = [
        [0, 1], 
        [1, 0], 
        [0, -1], 
        [-1, 0]  
    ];

    let currentDir = 0;
    let stepsInCurrentDir = 1;
    let stepsTaken = 0;
    let y = centerY;
    let x = centerX;

    while (order.length < tilesX * tilesY) {
        const [dy, dx] = directions[currentDir];
        y += dy;
        x += dx;

        if (y >= 0 && y < tilesY && x >= 0 && x < tilesX) {
            const key = `${y},${x}`;
            if (!visited.has(key)) {
                order.push([y, x]);
                visited.add(key);
            }
        }

        stepsTaken++;

        if (stepsTaken === stepsInCurrentDir) {
            currentDir = (currentDir + 1) % 4;
            stepsTaken = 0;

            if (currentDir === 0 || currentDir === 2) {
                stepsInCurrentDir++;
            }
        }
    }

    return order;
}

/**
 * Calculate reasonable contour levels based on data range
 */
function calculateLevels(values, numLevels = 10) {
    const validValues = values.filter(v => !isNaN(v));
    const min = Math.min(...validValues);
    const max = Math.max(...validValues);
    const range = max - min;

    return Array.from({ length: numLevels }, (_, i) =>
        min + (range * (i + 0.5) / numLevels)
    );
}

/**
 * Process data using the tiled approach
 */
async function processByTiles(values, width, height, options = {}) {
    const tileSize = options.tileSize || 128;

    let levels;
    if (options.levels && options.levels.length > 0) {
        levels = options.levels;
    } else {
        const numLevels = options.numLevels || 10;
        levels = calculateLevels(values, numLevels);
    }

    console.log(`Using ${levels.length} contour levels:`, levels);

    const builder = new TiledIsolineBuilder(levels, tileSize);

    const tilesX = Math.ceil(width / tileSize);
    const tilesY = Math.ceil(height / tileSize);

    console.log(`Grid will be split into ${tilesX}x${tilesY} tiles (${tileSize}x${tileSize})`);

    const tileOrder = generateTileProcessingOrder(tilesX, tilesY);

    const intermediatesDir = path.join(outputDir, 'intermediates');
    if (options.saveIntermediates && !fs.existsSync(intermediatesDir)) {
        fs.mkdirSync(intermediatesDir);
    }

    for (let tileIndex = 0; tileIndex < tileOrder.length; tileIndex++) {
        const [tileY, tileX] = tileOrder[tileIndex];

        const tileData = extractTile(values, width, height, tileX, tileY, tileSize);

        console.log(`Processing tile (${tileY}, ${tileX}) [${tileIndex + 1}/${tileOrder.length}]`);

        const currentIsolines = builder.addTile(tileY, tileX, tileData);

        if (options.saveIntermediates) {
            const intermediatePath = path.join(
                intermediatesDir,
                `isolines_tile_${tileIndex + 1}_of_${tileOrder.length}.geojson`
            );
            fs.writeFileSync(intermediatePath, JSON.stringify(currentIsolines, null, 2));
            console.log(`Saved intermediate result to ${intermediatePath}`);
        }
    }

    return builder.getIsolinesAsGeoJSON();
}

/**
 * Main function to handle different input types
 */
async function main() {
    const inputPath = process.argv[2];
    const optionsArg = process.argv[3];

    if (!inputPath) {
        console.error('Error: No input provided.');
        console.error('Usage: node generate-geojson.js input.csv "{options}"');
        console.error('   or: node generate-geojson.js "[values]" "{options}"');
        console.error('Example: node generate-geojson.js data.csv "{"sampleEvery":4,"tileSize":128,"saveIntermediates":true}"');
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

    let values, width, height, sampleEvery = 1;

    try {
        if (inputPath.endsWith('.csv') && fs.existsSync(inputPath)) {
            const result = await processCSVInChunks(inputPath, options);
            values = result.values;
            width = result.width;
            height = result.height;
            sampleEvery = result.sampleEvery;
        } else {
            values = parseInputValues(inputPath);
            width = options.width || Math.ceil(Math.sqrt(values.length));
            height = options.height || Math.ceil(values.length / width);

            if (!options.sampleEvery && values.length > 1000000) {
                sampleEvery = 4; 
                console.log(`Large dataset detected (${values.length} values). Automatically setting sampleEvery=${sampleEvery}`);

                const sampledValues = [];
                for (let i = 0; i < height; i += sampleEvery) {
                    for (let j = 0; j < width; j += sampleEvery) {
                        const index = i * width + j;
                        if (index < values.length) {
                            sampledValues.push(values[index]);
                        }
                    }
                }

                values = sampledValues;
                width = Math.ceil(width / sampleEvery);
                height = Math.ceil(height / sampleEvery);

                console.log(`After sampling: ${values.length} values (${width}x${height})`);
            }
        }

        console.log(`Dataset size: ${width}x${height} (${values.length} values)`);

        if (values.length === 0) {
            throw new Error('No valid data found');
        }

        let tileSize = options.tileSize || 128;
        if (values.length > 1000000 && !options.tileSize) {
            tileSize = 256;
            console.log(`Large dataset detected. Automatically setting tileSize=${tileSize}`);
        }

        const tileOptions = {
            ...options,
            tileSize: tileSize,
            saveIntermediates: options.saveIntermediates || false
        };

        console.log('Processing data using tiled approach...');
        const startTime = Date.now();

        const geojson = await processByTiles(values, width, height, tileOptions);

        const endTime = Date.now();
        console.log(`Processing completed in ${((endTime - startTime) / 1000).toFixed(2)} seconds`);

        const outputPath = path.join(outputDir, `isolines.geojson`);
        fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
        console.log(`Saved final GeoJSON to ${outputPath}`);

        const metadataPath = path.join(outputDir, `isolines-metadata.json`);
        fs.writeFileSync(metadataPath, JSON.stringify({
            originalFile: inputPath,
            processedAt: new Date().toISOString(),
            dimensions: {
                width,
                height,
                totalValues: values.length
            },
            processing: {
                sampleEvery,
                tileSize,
                tilesX: Math.ceil(width / tileSize),
                tilesY: Math.ceil(height / tileSize),
                saveIntermediates: options.saveIntermediates || false
            },
            levels: geojson.features.map(f => f.properties.level)
                .filter((v, i, a) => a.indexOf(v) === i)
                .sort((a, b) => a - b),
            featureCount: geojson.features.length,
            processingTimeMs: (endTime - startTime)
        }, null, 2));
        console.log(`Metadata saved to ${metadataPath}`);

        console.log('Done!');
    } catch (error) {
        console.error('Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

/**
 * Simulate WMTS tile-by-tile arrival
 * This demonstrates how isolines can be built incrementally as tiles arrive
 */
async function simulateWMTSTileArrival(values, width, height, options = {}) {
    const tileSize = options.tileSize || 128;

    let levels;
    if (options.levels && options.levels.length > 0) {
        levels = options.levels;
    } else {
        const numLevels = options.numLevels || 10;
        levels = calculateLevels(values, numLevels);
    }

    console.log(`Using ${levels.length} contour levels:`, levels);

    const builder = new TiledIsolineBuilder(levels, tileSize);

    const tilesX = Math.ceil(width / tileSize);
    const tilesY = Math.ceil(height / tileSize);

    console.log(`Grid will be split into ${tilesX}x${tilesY} tiles (${tileSize}x${tileSize})`);

    const wmtsDir = path.join(outputDir, 'wmts_simulation');
    if (!fs.existsSync(wmtsDir)) {
        fs.mkdirSync(wmtsDir);
    }

    const tileOrder = options.randomOrder ?
        shuffleArray(generateAllTileCoordinates(tilesX, tilesY)) :
        generateTileProcessingOrder(tilesX, tilesY);

    console.log(`Simulating arrival of ${tileOrder.length} tiles in ${options.randomOrder ? 'random' : 'spiral'} order`);

    for (let tileIndex = 0; tileIndex < tileOrder.length; tileIndex++) {
        const [tileY, tileX] = tileOrder[tileIndex];

        const tileData = extractTile(values, width, height, tileX, tileY, tileSize);

        console.log(`Tile (${tileY}, ${tileX}) arrived [${tileIndex + 1}/${tileOrder.length}]`);

        const currentIsolines = builder.addTile(tileY, tileX, tileData);

        const statePath = path.join(wmtsDir, `state_after_tile_${tileIndex + 1}.geojson`);
        fs.writeFileSync(statePath, JSON.stringify(currentIsolines, null, 2));

        const tilesVisualization = createTilesVisualization(tilesX, tilesY, tileOrder.slice(0, tileIndex + 1));
        const tilesPath = path.join(wmtsDir, `tiles_arrived_${tileIndex + 1}.json`);
        fs.writeFileSync(tilesPath, JSON.stringify(tilesVisualization, null, 2));

        if (options.simulateDelay) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    console.log(`WMTS simulation complete. Results saved to ${wmtsDir}`);
    return builder.getIsolinesAsGeoJSON();
}

/**
 * Generate all tile coordinates
 */
function generateAllTileCoordinates(tilesX, tilesY) {
    const coordinates = [];
    for (let y = 0; y < tilesY; y++) {
        for (let x = 0; x < tilesX; x++) {
            coordinates.push([y, x]);
        }
    }
    return coordinates;
}

/**
 * Shuffle array (Fisher-Yates algorithm)
 */
function shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/**
 * Create a visualization of which tiles have arrived
 */
function createTilesVisualization(tilesX, tilesY, arrivedTiles) {
    const grid = Array(tilesY).fill().map(() => Array(tilesX).fill(0));

    for (const [y, x] of arrivedTiles) {
        if (y >= 0 && y < tilesY && x >= 0 && x < tilesX) {
            grid[y][x] = 1;
        }
    }

    return {
        dimensions: { tilesX, tilesY },
        arrivedCount: arrivedTiles.length,
        totalTiles: tilesX * tilesY,
        grid
    };
}

// Check if this script is being run with the WMTS simulation flag
if (process.argv.includes('--simulate-wmts')) {
    // Remove the flag from arguments
    const args = process.argv.filter(arg => arg !== '--simulate-wmts');

    // Run the WMTS simulation
    (async () => {
        try {
            const inputPath = args[2];
            const optionsArg = args[3];

            if (!inputPath) {
                console.error('Error: No input provided for WMTS simulation.');
                console.error('Usage: node generate-geojson.js --simulate-wmts input.csv "{options}"');
                process.exit(1);
            }

            // Parse options
            let options = {};
            if (optionsArg) {
                try {
                    options = JSON.parse(optionsArg);
                } catch (error) {
                    console.error('Invalid options format. Using defaults.');
                }
            }

            // Add simulation-specific options
            options.randomOrder = options.randomOrder || false;
            options.simulateDelay = options.simulateDelay || false;

            // Process the input
            let values, width, height;

            if (inputPath.endsWith('.csv') && fs.existsSync(inputPath)) {
                const result = await processCSVInChunks(inputPath, options);
                values = result.values;
                width = result.width;
                height = result.height;
            } else {
                values = parseInputValues(inputPath);
                width = options.width || Math.ceil(Math.sqrt(values.length));
                height = options.height || Math.ceil(values.length / width);
            }

            console.log(`Running WMTS tile arrival simulation with ${width}x${height} grid`);
            await simulateWMTSTileArrival(values, width, height, options);

        } catch (error) {
            console.error('WMTS simulation error:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    })();
} else {
    main().catch(error => {
        console.error('Unhandled error:', error);
        console.error(error.stack);
        process.exit(1);
    });
}


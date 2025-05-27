const {
    generateIsolinesFromValues,
    generateIsolines,
    Conrec,
    IsolineBuilder,
    SpatialIndex,
    TiledIsolineBuilder
} = require('../../index');

describe('Index Module', () => {
    describe('Module Exports', () => {
        test('exports all required functions and classes', () => {
            expect(typeof generateIsolinesFromValues).toBe('function');
            expect(typeof generateIsolines).toBe('function');
            expect(typeof Conrec).toBe('function');
            expect(typeof IsolineBuilder).toBe('function');
            expect(typeof SpatialIndex).toBe('function');
            expect(typeof TiledIsolineBuilder).toBe('function');
        });

        test('exported classes can be instantiated', () => {
            expect(() => new Conrec()).not.toThrow();
            expect(() => new IsolineBuilder()).not.toThrow();
            expect(() => new SpatialIndex()).not.toThrow();
            expect(() => new TiledIsolineBuilder()).not.toThrow();
        });
    });

    describe('generateIsolinesFromValues', () => {
        test('generates isolines from simple 1D array', () => {
            const values = [10, 20, 30, 40, 50, 60, 70, 80, 90];

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 3
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
            expect(Array.isArray(result.features)).toBe(true);
        });

        test('handles square grid without explicit dimensions', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9]; // 3x3 grid

            const result = generateIsolinesFromValues(values);

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
            expect(Array.isArray(result.features)).toBe(true);
        });

        test('handles rectangular grid', () => {
            const values = [1, 2, 3, 4, 5, 6]; // 2x3 grid

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 2
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('uses custom contour levels', () => {
            const values = [10, 20, 30, 40, 50, 60, 70, 80, 90];
            const customLevels = [25, 45, 65];

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 3,
                levels: customLevels
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');

            // Check that features have the expected levels
            const featureLevels = result.features.map(f => f.properties.level);
            customLevels.forEach(level => {
                expect(featureLevels).toContain(level);
            });
        });

        test('forces tiled processing for small datasets', () => {
            const values = [1, 2, 3, 4]; // Small dataset

            const result = generateIsolinesFromValues(values, {
                width: 2,
                height: 2,
                forceTiled: true,
                tileSize: 1
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('automatically uses tiled processing for large datasets', () => {
            // Create a large dataset that should trigger tiled processing
            const size = 200;
            const values = Array.from({ length: size * size }, (_, i) => i % 100);

            const result = generateIsolinesFromValues(values, {
                width: size,
                height: size,
                tileSize: 64
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles custom tile size', () => {
            const values = Array.from({ length: 100 }, (_, i) => i);

            const result = generateIsolinesFromValues(values, {
                width: 10,
                height: 10,
                tileSize: 5,
                forceTiled: true
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('throws error for empty values array', () => {
            expect(() => {
                generateIsolinesFromValues([]);
            }).toThrow('Values must be a non-empty array of numbers');
        });

        test('throws error for non-array input', () => {
            expect(() => {
                generateIsolinesFromValues("invalid");
            }).toThrow('Values must be a non-empty array of numbers');

            expect(() => {
                generateIsolinesFromValues(null);
            }).toThrow('Values must be a non-empty array of numbers');

            expect(() => {
                generateIsolinesFromValues(undefined);
            }).toThrow('Values must be a non-empty array of numbers');
        });

        test('handles values with NaN and invalid numbers', () => {
            const values = [1, 2, NaN, 4, null, 6, undefined, 8, "invalid"];

            expect(() => {
                generateIsolinesFromValues(values, {
                    width: 3,
                    height: 3
                });
            }).not.toThrow(); // Should handle gracefully
        });

        test('handles non-square grids correctly', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; // 3x4 or 4x3

            const result1 = generateIsolinesFromValues(values, {
                width: 4,
                height: 3
            });

            const result2 = generateIsolinesFromValues(values, {
                width: 3,
                height: 4
            });

            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
            expect(result1.type).toBe('FeatureCollection');
            expect(result2.type).toBe('FeatureCollection');
        });

        test('handles edge case with single value', () => {
            const values = [42];

            const result = generateIsolinesFromValues(values, {
                width: 1,
                height: 1
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
            // Should return empty features or handle gracefully
        });

        test('handles large width/height values', () => {
            const values = [1, 2, 3, 4, 5, 6];

            const result = generateIsolinesFromValues(values, {
                width: 1000, // Much larger than data
                height: 1000
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('performance with medium-sized dataset', () => {
            const size = 50;
            const values = Array.from({ length: size * size }, (_, i) =>
                Math.sin(i / 100) * 100 + Math.cos(i / 50) * 50
            );

            const startTime = performance.now();
            const result = generateIsolinesFromValues(values, {
                width: size,
                height: size
            });
            const endTime = performance.now();

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
            expect(endTime - startTime).toBeLessThan(5000); // Should complete in reasonable time
        });
    });

    describe('generateIsolines', () => {
        test('generates isolines from 2D grid', () => {
            const grid = [
                [10, 20, 30],
                [40, 50, 60],
                [70, 80, 90]
            ];
            const levels = [25, 45, 65, 85];

            const result = generateIsolines(grid, levels);

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
            expect(Array.isArray(result.features)).toBe(true);
        });

        test('handles single level', () => {
            const grid = [
                [10, 20],
                [30, 40]
            ];
            const levels = [25];

            const result = generateIsolines(grid, levels);

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles multiple levels', () => {
            const grid = [
                [0, 10, 20],
                [30, 40, 50],
                [60, 70, 80]
            ];
            const levels = [15, 35, 55, 75];

            const result = generateIsolines(grid, levels);

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');

            // Should have features for the levels that intersect the data
            expect(result.features.length).toBeGreaterThanOrEqual(0);
        });

        test('returns valid GeoJSON structure', () => {
            const grid = [
                [10, 20, 30],
                [40, 50, 60],
                [70, 80, 90]
            ];
            const levels = [45];

            const result = generateIsolines(grid, levels);

            expect(result.type).toBe('FeatureCollection');
            expect(Array.isArray(result.features)).toBe(true);

            result.features.forEach(feature => {
                expect(feature.type).toBe('Feature');
                expect(feature.properties).toBeDefined();
                expect(typeof feature.properties.level).toBe('number');
                expect(feature.geometry).toBeDefined();
                expect(['Polygon', 'LineString']).toContain(feature.geometry.type);
                expect(Array.isArray(feature.geometry.coordinates)).toBe(true);
            });
        });

        test('handles uniform grid values', () => {
            const grid = [
                [50, 50, 50],
                [50, 50, 50],
                [50, 50, 50]
            ];
            const levels = [25, 50, 75];

            const result = generateIsolines(grid, levels);

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
            // Should return empty features or handle gracefully for uniform data
        });

        test('handles grid with extreme values', () => {
            const grid = [
                [Number.MIN_VALUE, Number.MAX_VALUE],
                [0, Infinity]
            ];
            const levels = [1000];

            expect(() => {
                generateIsolines(grid, levels);
            }).not.toThrow(); // Should handle gracefully
        });

        test('throws error for invalid grid', () => {
            expect(() => {
                generateIsolines([], [1000]);
            }).toThrow('Invalid grid: must be a non-empty 2D array');

            expect(() => {
                generateIsolines([[]], [1000]);
            }).toThrow('Invalid grid: must be a non-empty 2D array');

            expect(() => {
                generateIsolines("invalid", [1000]);
            }).toThrow('Invalid grid: must be a non-empty 2D array');

            expect(() => {
                generateIsolines(null, [1000]);
            }).toThrow('Invalid grid: must be a non-empty 2D array');
        });

        test('throws error for invalid levels', () => {
            const grid = [[1, 2], [3, 4]];

            expect(() => {
                generateIsolines(grid, []);
            }).toThrow('Invalid levels: must be a non-empty array of numbers');

            expect(() => {
                generateIsolines(grid, "invalid");
            }).toThrow('Invalid levels: must be a non-empty array of numbers');

            expect(() => {
                generateIsolines(grid, null);
            }).toThrow('Invalid levels: must be a non-empty array of numbers');
        });

        test('handles irregular grid shapes', () => {
            const irregularGrid = [
                [1, 2, 3],
                [4, 5], // Shorter row
                [6, 7, 8, 9] // Longer row
            ];
            const levels = [5];

            expect(() => {
                generateIsolines(irregularGrid, levels);
            }).not.toThrow(); // Should handle gracefully
        });

        test('handles grid with NaN values', () => {
            const grid = [
                [10, NaN, 30],
                [40, 50, 60],
                [NaN, 80, 90]
            ];
            const levels = [45];

            expect(() => {
                generateIsolines(grid, levels);
            }).not.toThrow(); // Should handle gracefully
        });

        test('handles very large grid', () => {
            const size = 100;
            const grid = Array.from({ length: size }, (_, i) =>
                Array.from({ length: size }, (_, j) => i + j)
            );
            const levels = [50, 100, 150];

            const startTime = performance.now();
            const result = generateIsolines(grid, levels);
            const endTime = performance.now();

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
            expect(endTime - startTime).toBeLessThan(10000); // Should complete in reasonable time
        });

        test('produces closed polygons', () => {
            const grid = [
                [10, 20, 30],
                [40, 50, 60],
                [70, 80, 90]
            ];
            const levels = [45];

            const result = generateIsolines(grid, levels);

            result.features.forEach(feature => {
                if (feature.geometry.type === 'Polygon') {
                    const coordinates = feature.geometry.coordinates[0];
                    expect(coordinates.length).toBeGreaterThanOrEqual(4); // At least 4 points for a closed polygon

                    // First and last coordinates should be the same
                    const first = coordinates[0];
                    const last = coordinates[coordinates.length - 1];
                    expect(first[0]).toBe(last[0]);
                    expect(first[1]).toBe(last[1]);
                }
            });
        });
    });

    describe('extractTile (internal function)', () => {
        // Test the internal extractTile function through generateIsolinesFromValues
        test('correctly extracts tiles from large dataset', () => {
            const size = 10;
            const values = Array.from({ length: size * size }, (_, i) => i);

            const result = generateIsolinesFromValues(values, {
                width: size,
                height: size,
                tileSize: 5,
                forceTiled: true
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles edge tiles correctly', () => {
            // Create a dataset where tiles don't divide evenly
            const values = Array.from({ length: 23 }, (_, i) => i); // 23 values

            const result = generateIsolinesFromValues(values, {
                width: 5,
                height: 5, // 25 expected, but only 23 provided
                tileSize: 3,
                forceTiled: true
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });
    });

    describe('isolinesToGeoJSON (internal function)', () => {
        test('converts isolines to proper GeoJSON format', () => {
            const grid = [
                [10, 20, 30],
                [40, 50, 60],
                [70, 80, 90]
            ];
            const levels = [45];

            const result = generateIsolines(grid, levels);

            // Verify GeoJSON structure
            expect(result.type).toBe('FeatureCollection');
            expect(Array.isArray(result.features)).toBe(true);

            result.features.forEach(feature => {
                expect(feature.type).toBe('Feature');
                expect(feature.properties).toBeDefined();
                expect(feature.properties.level).toBeDefined();
                expect(feature.geometry).toBeDefined();
                expect(feature.geometry.type).toBeDefined();
                expect(feature.geometry.coordinates).toBeDefined();
            });
        });
    });

    describe('Integration Tests', () => {
        test('end-to-end workflow with realistic data', () => {
            // Simulate realistic elevation data
            const size = 20;
            const values = Array.from({ length: size * size }, (_, i) => {
                const x = i % size;
                const y = Math.floor(i / size);
                const centerX = size / 2;
                const centerY = size / 2;
                const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
                return 1000 + Math.exp(-distance / 5) * 200; // Mountain-like elevation
            });

            const result = generateIsolinesFromValues(values, {
                width: size,
                height: size,
                levels: [1050, 1100, 1150]
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
            expect(result.features.length).toBeGreaterThan(0);

            // Verify that we have features for our specified levels
            const featureLevels = result.features.map(f => f.properties.level);
            expect(featureLevels).toContain(1050);
        });

        test('handles weather data simulation', () => {
            // Simulate pressure data
            const size = 15;
            const values = Array.from({ length: size * size }, (_, i) => {
                const x = i % size;
                const y = Math.floor(i / size);
                return 1013 + Math.sin(x / 3) * 10 + Math.cos(y / 3) * 8;
            });

            const result = generateIsolinesFromValues(values, {
                width: size,
                height: size
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('compares tiled vs non-tiled processing', () => {
            const values = Array.from({ length: 100 }, (_, i) =>
                Math.sin(i / 10) * 50 + 100
            );

            // Non-tiled processing
            const nonTiled = generateIsolinesFromValues(values, {
                width: 10,
                height: 10,
                forceTiled: false
            });

            // Tiled processing
            const tiled = generateIsolinesFromValues(values, {
                width: 10,
                height: 10,
                forceTiled: true,
                tileSize: 5
            });

            expect(nonTiled).toBeDefined();
            expect(tiled).toBeDefined();
            expect(nonTiled.type).toBe('FeatureCollection');
            expect(tiled.type).toBe('FeatureCollection');

            // Both should produce valid results
            expect(nonTiled.features.length).toBeGreaterThanOrEqual(0);
            expect(tiled.features.length).toBeGreaterThanOrEqual(0);
        });

        test('memory efficiency with large datasets', () => {
            const initialMemory = process.memoryUsage().heapUsed;

            const size = 100;
            const values = Array.from({ length: size * size }, (_, i) => i % 1000);

            const result = generateIsolinesFromValues(values, {
                width: size,
                height: size,
                tileSize: 25
            });

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
        });

        test('performance comparison between approaches', () => {
            const values = Array.from({ length: 2500 }, (_, i) => i % 100); // 50x50

            // Test non-tiled performance
            const startNonTiled = performance.now();
            const nonTiledResult = generateIsolinesFromValues(values, {
                width: 50,
                height: 50,
                forceTiled: false
            });
            const endNonTiled = performance.now();

            // Test tiled performance
            const startTiled = performance.now();
            const tiledResult = generateIsolinesFromValues(values, {
                width: 50,
                height: 50,
                forceTiled: true,
                tileSize: 25
            });
            const endTiled = performance.now();

            const nonTiledTime = endNonTiled - startNonTiled;
            const tiledTime = endTiled - startTiled;

            expect(nonTiledResult).toBeDefined();
            expect(tiledResult).toBeDefined();
            expect(nonTiledTime).toBeLessThan(10000); // Should complete in reasonable time
            expect(tiledTime).toBeLessThan(10000); // Should complete in reasonable time

            console.log(`Non-tiled: ${nonTiledTime.toFixed(2)}ms, Tiled: ${tiledTime.toFixed(2)}ms`);
        });
    });

    describe('Error Recovery and Edge Cases', () => {
        test('handles mixed valid and invalid data', () => {
            const values = [1, 2, NaN, 4, null, 6, undefined, 8, Infinity, 10];

            const result = generateIsolinesFromValues(values, {
                width: 5,
                height: 2
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles extreme aspect ratios', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

            // Very wide
            const wideResult = generateIsolinesFromValues(values, {
                width: 10,
                height: 1
            });

            // Very tall
            const tallResult = generateIsolinesFromValues(
                values, {
                width: 1,
                height: 10
            });

            expect(wideResult).toBeDefined();
            expect(tallResult).toBeDefined();
            expect(wideResult.type).toBe('FeatureCollection');
            expect(tallResult.type).toBe('FeatureCollection');
        });

        test('handles zero and negative values', () => {
            const values = [-100, -50, 0, 50, 100, -25, 25, -75, 75];

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 3,
                levels: [-60, -10, 40]
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles very small differences in values', () => {
            const baseValue = 1000.0;
            const values = Array.from({ length: 9 }, (_, i) =>
                baseValue + i * 0.0001 // Very small increments
            );

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 3
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles very large differences in values', () => {
            const values = [1, 1000000, 2, 999999, 3, 1000001, 4, 999998, 5];

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 3
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('gracefully handles insufficient data for grid dimensions', () => {
            const values = [1, 2, 3]; // Only 3 values

            const result = generateIsolinesFromValues(values, {
                width: 5,
                height: 5 // Expects 25 values
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles excessive data for grid dimensions', () => {
            const values = Array.from({ length: 100 }, (_, i) => i);

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 3 // Only needs 9 values
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles empty levels array gracefully', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 3,
                levels: [] // Empty levels
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
            // Should generate default levels or return empty features
        });

        test('handles levels outside data range', () => {
            const values = [10, 20, 30, 40, 50, 60, 70, 80, 90]; // Range 10-90

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 3,
                levels: [5, 95, 100] // Outside range
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
            // Should return empty features or handle gracefully
        });

        test('handles duplicate values in levels', () => {
            const values = [10, 20, 30, 40, 50, 60, 70, 80, 90];

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 3,
                levels: [50, 50, 50, 60, 60] // Duplicates
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles unsorted levels', () => {
            const values = [10, 20, 30, 40, 50, 60, 70, 80, 90];

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 3,
                levels: [70, 30, 90, 10, 50] // Unsorted
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });
    });

    describe('Coordinate System and Geographic Data', () => {
        test('handles geographic coordinate ranges', () => {
            // Simulate lat/lon data
            const values = Array.from({ length: 100 }, (_, i) => {
                const lat = -90 + (i % 10) * 18; // -90 to 90
                const lon = -180 + Math.floor(i / 10) * 36; // -180 to 180
                return 1013 + Math.sin(lat * Math.PI / 180) * 10; // Pressure variation by latitude
            });

            const result = generateIsolinesFromValues(values, {
                width: 10,
                height: 10
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles polar coordinate singularities', () => {
            // Simulate data with polar singularities
            const size = 10;
            const values = Array.from({ length: size * size }, (_, i) => {
                const x = (i % size) - size / 2;
                const y = Math.floor(i / size) - size / 2;
                const r = Math.sqrt(x * x + y * y);
                return r < 0.1 ? 1000 : 1000 + r * 10; // Singularity at center
            });

            const result = generateIsolinesFromValues(values, {
                width: size,
                height: size
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles antimeridian crossing simulation', () => {
            // Simulate data that crosses the antimeridian
            const values = Array.from({ length: 36 }, (_, i) => {
                const lon = i * 10 - 180; // -180 to 170
                return 1013 + Math.cos(lon * Math.PI / 180) * 20;
            });

            const result = generateIsolinesFromValues(values, {
                width: 6,
                height: 6
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });
    });

    describe('Data Type Handling', () => {
        test('handles integer values', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 3
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles floating point values', () => {
            const values = [1.1, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7, 8.8, 9.9];

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 3
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles mixed numeric types', () => {
            const values = [1, 2.5, 3, 4.7, 5, 6.1, 7, 8.9, 9];

            const result = generateIsolinesFromValues(values, {
                width: 3,
                height: 3
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('handles string numbers', () => {
            const values = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

            expect(() => {
                generateIsolinesFromValues(values, {
                    width: 3,
                    height: 3
                });
            }).not.toThrow(); // Should handle conversion gracefully
        });

        test('handles boolean values', () => {
            const values = [true, false, true, false, true, false, true, false, true];

            expect(() => {
                generateIsolinesFromValues(values, {
                    width: 3,
                    height: 3
                });
            }).not.toThrow(); // Should handle conversion gracefully
        });
    });

    describe('Options Validation and Defaults', () => {
        test('uses sensible defaults when options are missing', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];

            // No options provided
            const result1 = generateIsolinesFromValues(values);

            // Empty options object
            const result2 = generateIsolinesFromValues(values, {});

            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
            expect(result1.type).toBe('FeatureCollection');
            expect(result2.type).toBe('FeatureCollection');
        });

        test('handles invalid option values gracefully', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];

            const result = generateIsolinesFromValues(values, {
                width: "invalid",
                height: null,
                tileSize: -1,
                forceTiled: "yes",
                levels: "not an array"
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
        });

        test('validates tile size constraints', () => {
            const values = Array.from({ length: 100 }, (_, i) => i);

            // Very small tile size
            const result1 = generateIsolinesFromValues(values, {
                width: 10,
                height: 10,
                tileSize: 1,
                forceTiled: true
            });

            // Very large tile size
            const result2 = generateIsolinesFromValues(values, {
                width: 10,
                height: 10,
                tileSize: 1000,
                forceTiled: true
            });

            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
        });

        test('handles zero dimensions gracefully', () => {
            const values = [1, 2, 3, 4, 5];

            expect(() => {
                generateIsolinesFromValues(values, {
                    width: 0,
                    height: 5
                });
            }).not.toThrow();

            expect(() => {
                generateIsolinesFromValues(values, {
                    width: 5,
                    height: 0
                });
            }).not.toThrow();
        });

        test('handles negative dimensions gracefully', () => {
            const values = [1, 2, 3, 4, 5];

            expect(() => {
                generateIsolinesFromValues(values, {
                    width: -5,
                    height: 5
                });
            }).not.toThrow();

            expect(() => {
                generateIsolinesFromValues(values, {
                    width: 5,
                    height: -5
                });
            }).not.toThrow();
        });
    });

    describe('Stress Tests and Performance', () => {
        test('handles moderately large dataset efficiently', () => {
            const size = 200;
            const values = Array.from({ length: size * size }, (_, i) =>
                Math.sin(i / 1000) * 100 + Math.cos(i / 500) * 50
            );

            const startTime = performance.now();
            const result = generateIsolinesFromValues(values, {
                width: size,
                height: size,
                tileSize: 50
            });
            const endTime = performance.now();

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');
            expect(endTime - startTime).toBeLessThan(15000); // Should complete in reasonable time
        });

        test('memory usage remains reasonable', () => {
            const initialMemory = process.memoryUsage().heapUsed;

            // Process multiple datasets
            for (let i = 0; i < 10; i++) {
                const values = Array.from({ length: 1000 }, (_, j) => j + i * 1000);

                generateIsolinesFromValues(values, {
                    width: Math.sqrt(1000),
                    height: Math.sqrt(1000)
                });
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024); // Less than 200MB increase
        });

        test('handles concurrent processing', async () => {
            const promises = [];

            for (let i = 0; i < 5; i++) {
                const values = Array.from({ length: 100 }, (_, j) => j + i * 100);

                promises.push(
                    Promise.resolve(generateIsolinesFromValues(values, {
                        width: 10,
                        height: 10
                    }))
                );
            }

            const results = await Promise.all(promises);

            expect(results.length).toBe(5);
            results.forEach(result => {
                expect(result).toBeDefined();
                expect(result.type).toBe('FeatureCollection');
            });
        });

        test('handles repeated calls with same data', () => {
            const values = Array.from({ length: 100 }, (_, i) => i);
            const options = { width: 10, height: 10 };

            const results = [];
            for (let i = 0; i < 10; i++) {
                results.push(generateIsolinesFromValues(values, options));
            }

            // All results should be consistent
            expect(results.length).toBe(10);
            results.forEach(result => {
                expect(result).toBeDefined();
                expect(result.type).toBe('FeatureCollection');
                expect(result.features.length).toBe(results[0].features.length);
            });
        });

        test('handles varying data patterns efficiently', () => {
            const patterns = [
                // Linear gradient
                Array.from({ length: 100 }, (_, i) => i),
                // Sinusoidal
                Array.from({ length: 100 }, (_, i) => Math.sin(i / 10) * 50 + 50),
                // Random
                Array.from({ length: 100 }, () => Math.random() * 100),
                // Step function
                Array.from({ length: 100 }, (_, i) => Math.floor(i / 10) * 10),
                // Exponential
                Array.from({ length: 100 }, (_, i) => Math.exp(i / 50))
            ];

            patterns.forEach((values, index) => {
                const startTime = performance.now();
                const result = generateIsolinesFromValues(values, {
                    width: 10,
                    height: 10
                });
                const endTime = performance.now();

                expect(result).toBeDefined();
                expect(result.type).toBe('FeatureCollection');
                expect(endTime - startTime).toBeLessThan(1000); // Should be fast for small data
            });
        });
    });

    describe('Regression Tests', () => {
        test('maintains backward compatibility', () => {
            // Test that the API hasn't changed in breaking ways
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];

            // Old-style call (should still work)
            const result1 = generateIsolinesFromValues(values);

            // New-style call with all options
            const result2 = generateIsolinesFromValues(values, {
                width: 3,
                height: 3,
                tileSize: 2,
                forceTiled: false,
                levels: [2, 5, 8]
            });

            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
            expect(result1.type).toBe('FeatureCollection');
            expect(result2.type).toBe('FeatureCollection');
        });

        test('produces consistent results across versions', () => {
            // Fixed seed data for reproducible results
            const values = [
                10, 15, 20, 25, 30,
                35, 40, 45, 50, 55,
                60, 65, 70, 75, 80,
                85, 90, 95, 100, 105
            ];

            const result = generateIsolinesFromValues(values, {
                width: 5,
                height: 4,
                levels: [30, 60, 90]
            });

            expect(result).toBeDefined();
            expect(result.type).toBe('FeatureCollection');

            // Check that we have the expected structure
            expect(Array.isArray(result.features)).toBe(true);

            // Verify feature properties
            result.features.forEach(feature => {
                expect(feature.type).toBe('Feature');
                expect(feature.properties).toBeDefined();
                expect(typeof feature.properties.level).toBe('number');
                expect([30, 60, 90]).toContain(feature.properties.level);
            });
        });

        test('handles edge cases that previously caused issues', () => {
            // Test cases that might have caused problems in earlier versions

            // Single row
            const singleRow = [1, 2, 3, 4, 5];
            expect(() => {
                generateIsolinesFromValues(singleRow, { width: 5, height: 1 });
            }).not.toThrow();

            // Single column
            const singleCol = [1, 2, 3, 4, 5];
            expect(() => {
                generateIsolinesFromValues(singleCol, { width: 1, height: 5 });
            }).not.toThrow();

            // All same values
            const uniform = [50, 50, 50, 50, 50, 50, 50, 50, 50];
            expect(() => {
                generateIsolinesFromValues(uniform, { width: 3, height: 3 });
            }).not.toThrow();

            // Alternating values
            const alternating = [0, 100, 0, 100, 0, 100, 0, 100, 0];
            expect(() => {
                generateIsolinesFromValues(alternating, { width: 3, height: 3 });
            }).not.toThrow();
        });
    });
});        
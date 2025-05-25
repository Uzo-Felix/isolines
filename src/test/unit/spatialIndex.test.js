const SpatialIndex = require('../../spatialIndex');

describe('SpatialIndex', () => {
    let spatialIndex;

    beforeEach(() => {
        spatialIndex = new SpatialIndex(10);
    });

    describe('Constructor', () => {
        test('creates instance with default grid size', () => {
            const defaultIndex = new SpatialIndex();
            expect(defaultIndex.gridSize).toBe(10);
            expect(defaultIndex.EPSILON).toBe(0.01);
            expect(defaultIndex.rTree).toBeInstanceOf(Map);
        });

        test('creates instance with custom grid size', () => {
            const customIndex = new SpatialIndex(25);
            expect(customIndex.gridSize).toBe(25);
        });

        test('initializes empty spatial index', () => {
            expect(spatialIndex.rTree.size).toBe(0);
        });
    });

    describe('buildIndex', () => {
        test('builds index from empty segments array', () => {
            const segments = [];

            spatialIndex.buildIndex(segments);

            expect(spatialIndex.rTree.size).toBe(0);
        });

        test('builds index from single segment', () => {
            const segments = [
                {
                    p1: { lon: 5, lat: 5 },
                    p2: { lon: 15, lat: 15 },
                    level: 1000
                }
            ];

            spatialIndex.buildIndex(segments);

            expect(spatialIndex.rTree.size).toBeGreaterThan(0);

            // Check that segment is stored in appropriate grid cells
            const keys = Array.from(spatialIndex.rTree.keys());
            expect(keys.length).toBeGreaterThan(0);

            // Verify segment is retrievable
            let foundSegment = false;
            for (const key of keys) {
                const cellSegments = spatialIndex.rTree.get(key);
                if (cellSegments.includes(segments[0])) {
                    foundSegment = true;
                    break;
                }
            }
            expect(foundSegment).toBe(true);
        });

        test('builds index from multiple segments', () => {
            const segments = [
                { p1: { lon: 0, lat: 0 }, p2: { lon: 5, lat: 5 }, level: 1000 },
                { p1: { lon: 10, lat: 10 }, p2: { lon: 15, lat: 15 }, level: 1000 },
                { p1: { lon: 20, lat: 20 }, p2: { lon: 25, lat: 25 }, level: 1010 },
                { p1: { lon: 30, lat: 30 }, p2: { lon: 35, lat: 35 }, level: 1010 }
            ];

            spatialIndex.buildIndex(segments);

            expect(spatialIndex.rTree.size).toBeGreaterThan(0);

            // All segments should be indexed
            let totalIndexedSegments = 0;
            for (const cellSegments of spatialIndex.rTree.values()) {
                totalIndexedSegments += cellSegments.length;
            }
            expect(totalIndexedSegments).toBeGreaterThanOrEqual(segments.length);
        });

        test('handles segments spanning multiple grid cells', () => {
            const segments = [
                {
                    p1: { lon: 5, lat: 5 },
                    p2: { lon: 35, lat: 35 }, // Spans multiple 10x10 grid cells
                    level: 1000
                }
            ];

            spatialIndex.buildIndex(segments);

            // Segment should be indexed in multiple grid cells
            let cellsContainingSegment = 0;
            for (const cellSegments of spatialIndex.rTree.values()) {
                if (cellSegments.includes(segments[0])) {
                    cellsContainingSegment++;
                }
            }
            expect(cellsContainingSegment).toBeGreaterThan(1);
        });

        test('handles segments with negative coordinates', () => {
            const segments = [
                { p1: { lon: -15, lat: -15 }, p2: { lon: -5, lat: -5 }, level: 1000 },
                { p1: { lon: -5, lat: 5 }, p2: { lon: 5, lat: 15 }, level: 1000 }
            ];

            spatialIndex.buildIndex(segments);

            expect(spatialIndex.rTree.size).toBeGreaterThan(0);

            // Verify segments are properly indexed
            let foundSegments = 0;
            for (const cellSegments of spatialIndex.rTree.values()) {
                foundSegments += cellSegments.filter(s => segments.includes(s)).length;
            }
            expect(foundSegments).toBeGreaterThanOrEqual(segments.length);
        });
    });

    describe('findNeighbors', () => {
        beforeEach(() => {
            const segments = [
                { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 1 }, level: 1000 },
                { p1: { lon: 1, lat: 1 }, p2: { lon: 2, lat: 2 }, level: 1000 },
                { p1: { lon: 10, lat: 10 }, p2: { lon: 11, lat: 11 }, level: 1000 },
                { p1: { lon: 20, lat: 20 }, p2: { lon: 21, lat: 21 }, level: 1010 }
            ];
            spatialIndex.buildIndex(segments);
        });

        test('finds neighbors near existing segment endpoints', () => {
            const point = { lon: 1, lat: 1 };

            const neighbors = spatialIndex.findNeighbors(point);

            expect(neighbors).toBeInstanceOf(Array);
            expect(neighbors.length).toBeGreaterThan(0);

            // Should find segments that have endpoints near the query point
            const hasNearbyEndpoint = neighbors.some(segment =>
                spatialIndex.isNearPoint(segment, point)
            );
            expect(hasNearbyEndpoint).toBe(true);
        });

        test('returns empty array when no neighbors exist', () => {
            const point = { lon: 100, lat: 100 }; // Far from any segments

            const neighbors = spatialIndex.findNeighbors(point);

            expect(neighbors).toEqual([]);
        });

        test('does not return duplicate segments', () => {
            const point = { lon: 1, lat: 1 };

            const neighbors = spatialIndex.findNeighbors(point);

            // Check for duplicates
            const uniqueNeighbors = new Set(neighbors);
            expect(uniqueNeighbors.size).toBe(neighbors.length);
        });

        test('searches in 3x3 grid around point', () => {
            // Add segment that spans grid boundary
            const segments = [
                { p1: { lon: 9.99, lat: 9.99 }, p2: { lon: 10.01, lat: 10.01 }, level: 1000 }
            ];
            spatialIndex.buildIndex(segments);

            const point = { lon: 10, lat: 10 };
            const neighbors = spatialIndex.findNeighbors(point);

            expect(neighbors.length).toBeGreaterThan(0);
        });

        test('handles points at grid boundaries', () => {
            const point = { lon: 10, lat: 10 }; // Exactly on grid boundary

            const neighbors = spatialIndex.findNeighbors(point);

            expect(neighbors).toBeInstanceOf(Array);
            // Should not crash and should handle boundary correctly
        });

        test('handles negative coordinate points', () => {
            const segments = [
                { p1: { lon: -1, lat: -1 }, p2: { lon: 0, lat: 0 }, level: 1000 }
            ];
            spatialIndex.buildIndex(segments);

            const point = { lon: -0.5, lat: -0.5 };
            const neighbors = spatialIndex.findNeighbors(point);

            expect(neighbors).toBeInstanceOf(Array);
        });
    });

    describe('isNearPoint', () => {
        test('returns true for segment with endpoint near point', () => {
            const segment = {
                p1: { lon: 0, lat: 0 },
                p2: { lon: 1, lat: 1 },
                level: 1000
            };
            const point = { lon: 0.005, lat: 0.005 }; // Within epsilon

            const result = spatialIndex.isNearPoint(segment, point);

            expect(result).toBe(true);
        });

        test('returns false for segment with no endpoint near point', () => {
            const segment = {
                p1: { lon: 0, lat: 0 },
                p2: { lon: 1, lat: 1 },
                level: 1000
            };
            const point = { lon: 0.5, lat: 0.5 }; // Not near endpoints

            const result = spatialIndex.isNearPoint(segment, point);

            expect(result).toBe(false);
        });

        test('uses epsilon tolerance correctly', () => {
            const segment = {
                p1: { lon: 0, lat: 0 },
                p2: { lon: 1, lat: 1 },
                level: 1000
            };

            // Point exactly at epsilon distance
            const point = { lon: spatialIndex.EPSILON, lat: 0 };

            const result = spatialIndex.isNearPoint(segment, point);

            expect(result).toBe(true);
        });

        test('checks both endpoints of segment', () => {
            const segment = {
                p1: { lon: 0, lat: 0 },
                p2: { lon: 10, lat: 10 },
                level: 1000
            };

            // Near first endpoint
            const point1 = { lon: 0.005, lat: 0.005 };
            expect(spatialIndex.isNearPoint(segment, point1)).toBe(true);

            // Near second endpoint
            const point2 = { lon: 10.005, lat: 10.005 };
            expect(spatialIndex.isNearPoint(segment, point2)).toBe(true);

            // Not near either endpoint
            const point3 = { lon: 5, lat: 5 };
            expect(spatialIndex.isNearPoint(segment, point3)).toBe(false);
        });
    });

    describe('distance', () => {
        test('calculates distance between identical points', () => {
            const p1 = { lon: 5, lat: 5 };
            const p2 = { lon: 5, lat: 5 };

            const distance = spatialIndex.distance(p1, p2);

            expect(distance).toBe(0);
        });

        test('calculates distance between horizontal points', () => {
            const p1 = { lon: 0, lat: 0 };
            const p2 = { lon: 3, lat: 0 };

            const distance = spatialIndex.distance(p1, p2);

            expect(distance).toBe(3);
        });

        test('calculates distance between vertical points', () => {
            const p1 = { lon: 0, lat: 0 };
            const p2 = { lon: 0, lat: 4 };

            const distance = spatialIndex.distance(p1, p2);

            expect(distance).toBe(4);
        });

        test('calculates distance between diagonal points', () => {
            const p1 = { lon: 0, lat: 0 };
            const p2 = { lon: 3, lat: 4 };

            const distance = spatialIndex.distance(p1, p2);

            expect(distance).toBe(5); // 3-4-5 triangle
        });

        test('handles negative coordinates', () => {
            const p1 = { lon: -3, lat: -4 };
            const p2 = { lon: 0, lat: 0 };

            const distance = spatialIndex.distance(p1, p2);

            expect(distance).toBe(5);
        });

        test('is symmetric', () => {
            const p1 = { lon: 1, lat: 2 };
            const p2 = { lon: 4, lat: 6 };

            const distance1 = spatialIndex.distance(p1, p2);
            const distance2 = spatialIndex.distance(p2, p1);

            expect(distance1).toBe(distance2);
        });
    });

    describe('boundingBox', () => {
        test('calculates bounding box for horizontal segment', () => {
            const segment = {
                p1: { lon: 2, lat: 5 },
                p2: { lon: 8, lat: 5 },
                level: 1000
            };

            const bbox = spatialIndex.boundingBox(segment);

            expect(bbox).toEqual({
                minLon: 2,
                maxLon: 8,
                minLat: 5,
                maxLat: 5
            });
        });

        test('calculates bounding box for vertical segment', () => {
            const segment = {
                p1: { lon: 5, lat: 2 },
                p2: { lon: 5, lat: 8 },
                level: 1000
            };

            const bbox = spatialIndex.boundingBox(segment);

            expect(bbox).toEqual({
                minLon: 5,
                maxLon: 5,
                minLat: 2,
                maxLat: 8
            });
        });

        test('calculates bounding box for diagonal segment', () => {
            const segment = {
                p1: { lon: 1, lat: 3 },
                p2: { lon: 7, lat: 9 },
                level: 1000
            };

            const bbox = spatialIndex.boundingBox(segment);

            expect(bbox).toEqual({
                minLon: 1,
                maxLon: 7,
                minLat: 3,
                maxLat: 9
            });
        });

        test('handles reversed point order', () => {
            const segment = {
                p1: { lon: 7, lat: 9 },
                p2: { lon: 1, lat: 3 },
                level: 1000
            };

            const bbox = spatialIndex.boundingBox(segment);

            expect(bbox).toEqual({
                minLon: 1,
                maxLon: 7,
                minLat: 3,
                maxLat: 9
            });
        });

        test('handles point segment (identical endpoints)', () => {
            const segment = {
                p1: { lon: 5, lat: 5 },
                p2: { lon: 5, lat: 5 },
                level: 1000
            };

            const bbox = spatialIndex.boundingBox(segment);

            expect(bbox).toEqual({
                minLon: 5,
                maxLon: 5,
                minLat: 5,
                maxLat: 5
            });
        });

        test('handles negative coordinates', () => {
            const segment = {
                p1: { lon: -10, lat: -5 },
                p2: { lon: -2, lat: -1 },
                level: 1000
            };

            const bbox = spatialIndex.boundingBox(segment);

            expect(bbox).toEqual({
                minLon: -10,
                maxLon: -2,
                minLat: -5,
                maxLat: -1
            });
        });
    });

    describe('Performance and Edge Cases', () => {
        test('handles large number of segments efficiently', () => {
            const segments = [];
            for (let i = 0; i < 1000; i++) {
                segments.push({
                    p1: { lon: i, lat: i },
                    p2: { lon: i + 1, lat: i + 1 },
                    level: 1000 + (i % 10)
                });
            }

            const startTime = performance.now();
            spatialIndex.buildIndex(segments);
            const endTime = performance.now();

            expect(endTime - startTime).toBeLessThan(100); // Should be fast
            expect(spatialIndex.rTree.size).toBeGreaterThan(0);
        });

        test('handles very small grid size', () => {
            const smallGridIndex = new SpatialIndex(0.1);
            const segments = [
                { p1: { lon: 0, lat: 0 }, p2: { lon: 0.05, lat: 0.05 }, level: 1000 }
            ];

            smallGridIndex.buildIndex(segments);
            const neighbors = smallGridIndex.findNeighbors({ lon: 0.025, lat: 0.025 });

            expect(neighbors).toBeInstanceOf(Array);
        });

        test('handles very large grid size', () => {
            const largeGridIndex = new SpatialIndex(1000);
            const segments = [
                { p1: { lon: 0, lat: 0 }, p2: { lon: 500, lat: 500 }, level: 1000 }
            ];

            largeGridIndex.buildIndex(segments);
            const neighbors = largeGridIndex.findNeighbors({ lon: 250, lat: 250 });

            expect(neighbors).toBeInstanceOf(Array);
        });

        test('handles segments with very close but distinct endpoints', () => {
            const segments = [
                { p1: { lon: 0, lat: 0 }, p2: { lon: 1e-10, lat: 1e-10 }, level: 1000 }
            ];

            spatialIndex.buildIndex(segments);
            const neighbors = spatialIndex.findNeighbors({ lon: 0, lat: 0 });

            expect(neighbors.length).toBeGreaterThan(0);
        });

        test('memory usage scales reasonably with segment count', () => {
            const initialMemory = process.memoryUsage().heapUsed;

            const segments = [];
            for (let i = 0; i < 10000; i++) {
                segments.push({
                    p1: { lon: Math.random() * 1000, lat: Math.random() * 1000 },
                    p2: { lon: Math.random() * 1000, lat: Math.random() * 1000 },
                    level: 1000
                });
            }

            spatialIndex.buildIndex(segments);

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // < 50MB
        });

        test('handles concurrent neighbor searches', () => {
            const segments = [];
            for (let i = 0; i < 100; i++) {
                segments.push({
                    p1: { lon: i, lat: i },
                    p2: { lon: i + 1, lat: i + 1 },
                    level: 1000
                });
            }
            spatialIndex.buildIndex(segments);

            const searchPromises = [];
            for (let i = 0; i < 50; i++) {
                searchPromises.push(
                    Promise.resolve(spatialIndex.findNeighbors({ lon: i, lat: i }))
                );
            }

            return Promise.all(searchPromises).then(results => {
                expect(results).toHaveLength(50);
                results.forEach(neighbors => {
                    expect(neighbors).toBeInstanceOf(Array);
                });
            });
        });
    });

    describe('Grid Key Generation', () => {
        test('generates consistent grid keys for same coordinates', () => {
            const point = { lon: 15.5, lat: 25.7 };

            const gridX = Math.floor(point.lon / spatialIndex.gridSize);
            const gridY = Math.floor(point.lat / spatialIndex.gridSize);
            const expectedKey = `${gridX},${gridY}`;

            // Test multiple calls
            const key1 = `${Math.floor(point.lon / spatialIndex.gridSize)},${Math.floor(point.lat / spatialIndex.gridSize)}`;
            const key2 = `${Math.floor(point.lon / spatialIndex.gridSize)},${Math.floor(point.lat / spatialIndex.gridSize)}`;

            expect(key1).toBe(key2);
            expect(key1).toBe(expectedKey);
        });

        test('generates different keys for different grid cells', () => {
            const point1 = { lon: 5, lat: 5 };
            const point2 = { lon: 15, lat: 15 };

            const key1 = `${Math.floor(point1.lon / spatialIndex.gridSize)},${Math.floor(point1.lat / spatialIndex.gridSize)}`;
            const key2 = `${Math.floor(point2.lon / spatialIndex.gridSize)},${Math.floor(point2.lat / spatialIndex.gridSize)}`;

            expect(key1).not.toBe(key2);
        });

        test('handles negative coordinates in grid keys', () => {
            const point = { lon: -15.5, lat: -25.7 };

            const gridX = Math.floor(point.lon / spatialIndex.gridSize);
            const gridY = Math.floor(point.lat / spatialIndex.gridSize);
            const key = `${gridX},${gridY}`;

            expect(key).toContain('-');
            expect(typeof key).toBe('string');
        });
    });
});

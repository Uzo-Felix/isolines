const Conrec = require('../../conrec');


describe('Conrec Algorithm', () => {
    let conrec;

    beforeEach(() => {
        conrec = new Conrec();
    });

    describe('Constructor', () => {
        test('creates instance with default epsilon', () => {
            expect(conrec).toBeInstanceOf(Conrec);
            expect(conrec.EPSILON).toBe(0.01);
        });

        test('accepts custom epsilon value', () => {
            const customConrec = new Conrec(0.001);
            expect(customConrec.EPSILON).toBe(0.001);
        });
    });

    describe('computeSegments', () => {
        test('handles empty grid', () => {
            const grid = [];
            const levels = [1000];

            const segments = conrec.computeSegments(grid, levels);

            expect(segments).toEqual([]);
        });

        test('handles single cell grid', () => {
            const grid = [[1000]];
            const levels = [1000];

            const segments = conrec.computeSegments(grid, levels);

            expect(segments).toEqual([]);
        });

        test('generates segments for simple 2x2 grid', () => {
            const grid = [
                [995, 1005],
                [1005, 1015]
            ];
            const levels = [1000, 1010];

            const segments = conrec.computeSegments(grid, levels);

            expect(segments).toBeInstanceOf(Array);
            expect(segments.length).toBeGreaterThan(0);

            // Each segment should have required properties
            segments.forEach(segment => {
                expect(segment).toHaveProperty('p1');
                expect(segment).toHaveProperty('p2');
                expect(segment).toHaveProperty('level');
                expect(segment.p1).toHaveProperty('lon');
                expect(segment.p1).toHaveProperty('lat');
                expect(segment.p2).toHaveProperty('lon');
                expect(segment.p2).toHaveProperty('lat');
                expect(levels).toContain(segment.level);
            });
        });

        test('generates correct segments for known pattern', () => {
            // Create a simple gradient that should produce predictable contours
            const grid = [
                [1000, 1000, 1000],
                [1000, 1010, 1010],
                [1000, 1010, 1010]
            ];
            const levels = [1005];

            const segments = conrec.computeSegments(grid, levels);

            expect(segments.length).toBeGreaterThan(0);

            // All segments should be at level 1005
            segments.forEach(segment => {
                expect(segment.level).toBe(1005);
            });
        });

        test('handles multiple contour levels', () => {
            const grid = [
                [990, 1000, 1010],
                [1000, 1010, 1020],
                [1010, 1020, 1030]
            ];
            const levels = [995, 1005, 1015, 1025];

            const segments = conrec.computeSegments(grid, levels);

            expect(segments.length).toBeGreaterThan(0);

            // Should have segments for each level
            const foundLevels = new Set(segments.map(s => s.level));
            expect(foundLevels.size).toBeGreaterThan(1);

            // All segments should be at specified levels
            segments.forEach(segment => {
                expect(levels).toContain(segment.level);
            });
        });

        test('handles NaN values in grid', () => {
            const grid = [
                [1000, NaN, 1020],
                [NaN, 1010, NaN],
                [1020, NaN, 1030]
            ];
            const levels = [1015];

            const segments = conrec.computeSegments(grid, levels);

            // Should not crash and should handle NaN gracefully
            expect(segments).toBeInstanceOf(Array);

            // Segments should not contain NaN coordinates
            segments.forEach(segment => {
                expect(isNaN(segment.p1.lon)).toBe(false);
                expect(isNaN(segment.p1.lat)).toBe(false);
                expect(isNaN(segment.p2.lon)).toBe(false);
                expect(isNaN(segment.p2.lat)).toBe(false);
            });
        });

        test('handles uniform grid (no contours)', () => {
            const grid = [
                [1000, 1000, 1000],
                [1000, 1000, 1000],
                [1000, 1000, 1000]
            ];
            const levels = [1000, 1005, 1010];

            const segments = conrec.computeSegments(grid, levels);

            // Uniform grid should produce no contour segments
            expect(segments).toEqual([]);
        });

        test('validates input parameters', () => {
            expect(() => {
                conrec.computeSegments(null, [1000]);
            }).toThrow();

            expect(() => {
                conrec.computeSegments([[1000]], null);
            }).toThrow();

            expect(() => {
                conrec.computeSegments([[1000]], []);
            }).toThrow();
        });

        test('handles large grid efficiently', () => {
            // Create 100x100 grid
            const size = 100;
            const grid = Array(size).fill().map((_, i) =>
                Array(size).fill().map((_, j) => 1000 + i + j)
            );
            const levels = [1050, 1100, 1150];

            const startTime = performance.now();
            const segments = conrec.computeSegments(grid, levels);
            const endTime = performance.now();

            expect(segments).toBeInstanceOf(Array);
            expect(endTime - startTime).toBeLessThan(1000); // Should complete in < 1s
        });
    });

    describe('processCell', () => {
        test('processes cell with crossing contour', () => {
            // Mock a cell where contour crosses
            const cellValues = [995, 1005, 1015, 1005]; // Bottom-left, bottom-right, top-right, top-left
            const level = 1000;
            const i = 0, j = 0;

            const segments = [];
            conrec.processCell(cellValues, level, i, j, segments);

            expect(segments.length).toBeGreaterThan(0);

            segments.forEach(segment => {
                expect(segment.level).toBe(level);
                expect(segment.p1).toBeDefined();
                expect(segment.p2).toBeDefined();
            });
        });

        test('skips cell with no contour crossing', () => {
            // All values above the contour level
            const cellValues = [1005, 1010, 1015, 1020];
            const level = 1000;
            const i = 0, j = 0;

            const segments = [];
            conrec.processCell(cellValues, level, i, j, segments);

            expect(segments).toEqual([]);
        });

        test('handles cell with NaN values', () => {
            const cellValues = [1000, NaN, 1010, 1005];
            const level = 1005;
            const i = 0, j = 0;

            const segments = [];

            expect(() => {
                conrec.processCell(cellValues, level, i, j, segments);
            }).not.toThrow();
        });
    });

    describe('interpolateEdge', () => {
        test('interpolates edge crossing correctly', () => {
            const val1 = 1000;
            const val2 = 1020;
            const level = 1010;
            const coord1 = { lon: 0, lat: 0 };
            const coord2 = { lon: 1, lat: 0 };

            const result = conrec.interpolateEdge(val1, val2, level, coord1, coord2);

            expect(result).toBeDefined();
            expect(result.lon).toBeCloseTo(0.5, 5); // Should be halfway
            expect(result.lat).toBe(0);
        });

        test('handles edge case where values equal level', () => {
            const val1 = 1000;
            const val2 = 1000;
            const level = 1000;
            const coord1 = { lon: 0, lat: 0 };
            const coord2 = { lon: 1, lat: 0 };

            const result = conrec.interpolateEdge(val1, val2, level, coord1, coord2);

            expect(result).toBeDefined();
            expect(result.lon).toBeCloseTo(0, 5);
            expect(result.lat).toBe(0);
        });

        test('handles identical values', () => {
            const val1 = 1010;
            const val2 = 1010;
            const level = 1000;
            const coord1 = { lon: 0, lat: 0 };
            const coord2 = { lon: 1, lat: 0 };

            const result = conrec.interpolateEdge(val1, val2, level, coord1, coord2);

            // Should return null or handle gracefully when no crossing
            expect(result).toBeNull();
        });

        test('interpolates vertical edge correctly', () => {
            const val1 = 995;
            const val2 = 1015;
            const level = 1005;
            const coord1 = { lon: 0, lat: 0 };
            const coord2 = { lon: 0, lat: 1 };

            const result = conrec.interpolateEdge(val1, val2, level, coord1, coord2);

            expect(result).toBeDefined();
            expect(result.lon).toBe(0);
            expect(result.lat).toBeCloseTo(0.5, 5);
        });
    });

    describe('getCellValue', () => {
        test('returns correct cell value for valid coordinates', () => {
            const grid = [
                [1000, 1010],
                [1020, 1030]
            ];

            expect(conrec.getCellValue(grid, 0, 0)).toBe(1000);
            expect(conrec.getCellValue(grid, 0, 1)).toBe(1010);
            expect(conrec.getCellValue(grid, 1, 0)).toBe(1020);
            expect(conrec.getCellValue(grid, 1, 1)).toBe(1030);
        });

        test('returns NaN for out-of-bounds coordinates', () => {
            const grid = [
                [1000, 1010],
                [1020, 1030]
            ];

            expect(isNaN(conrec.getCellValue(grid, -1, 0))).toBe(true);
            expect(isNaN(conrec.getCellValue(grid, 0, -1))).toBe(true);
            expect(isNaN(conrec.getCellValue(grid, 2, 0))).toBe(true);
            expect(isNaN(conrec.getCellValue(grid, 0, 2))).toBe(true);
        });

        test('handles empty grid', () => {
            const grid = [];

            expect(isNaN(conrec.getCellValue(grid, 0, 0))).toBe(true);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('handles very small epsilon values', () => {
            const smallEpsilonConrec = new Conrec(1e-10);
            const grid = [
                [1000.0000000001, 1000.0000000002],
                [1000.0000000003, 1000.0000000004]
            ];
            const levels = [1000.0000000002];

            const segments = smallEpsilonConrec.computeSegments(grid, levels);

            expect(segments).toBeInstanceOf(Array);
        });

        test('handles very large values', () => {
            const grid = [
                [1e6, 2e6],
                [3e6, 4e6]
            ];
            const levels = [2.5e6];

            const segments = conrec.computeSegments(grid, levels);

            expect(segments).toBeInstanceOf(Array);
            segments.forEach(segment => {
                expect(isFinite(segment.p1.lon)).toBe(true);
                expect(isFinite(segment.p1.lat)).toBe(true);
                expect(isFinite(segment.p2.lon)).toBe(true);
                expect(isFinite(segment.p2.lat)).toBe(true);
            });
        });

        test('handles negative values', () => {
            const grid = [
                [-1000, -500],
                [-500, 0]
            ];
            const levels = [-750, -250];

            const segments = conrec.computeSegments(grid, levels);

            expect(segments).toBeInstanceOf(Array);
            segments.forEach(segment => {
                expect(levels).toContain(segment.level);
            });
        });

        test('handles irregular grid shapes', () => {
            const grid = [
                [1000, 1010, 1020],
                [1005, 1015], // Shorter row
                [1010, 1020, 1030]
            ];
            const levels = [1012];

            expect(() => {
                conrec.computeSegments(grid, levels);
            }).not.toThrow();
        });
    });

    describe('Performance Tests', () => {
        test('processes medium grid in reasonable time', () => {
            const size = 50;
            const grid = Array(size).fill().map((_, i) =>
                Array(size).fill().map((_, j) => 1000 + Math.sin(i * 0.1) * Math.cos(j * 0.1) * 100)
            );
            const levels = [1000, 1025, 1050, 1075, 1100];

            const startTime = performance.now();
            const segments = conrec.computeSegments(grid, levels);
            const endTime = performance.now();

            expect(endTime - startTime).toBeLessThan(500); // Should complete in < 500ms
            expect(segments.length).toBeGreaterThan(0);
        });

        test('memory usage remains reasonable for large grids', () => {
            const initialMemory = process.memoryUsage().heapUsed;

            const size = 200;
            const grid = Array(size).fill().map((_, i) =>
                Array(size).fill().map((_, j) => 1000 + i + j)
            );
            const levels = [1100, 1200, 1300];

            const segments = conrec.computeSegments(grid, levels);
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            expect(segments).toBeInstanceOf(Array);
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // < 100MB increase
        });
    });
});

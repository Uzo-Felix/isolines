const IsolineBuilder = require('../../isolineBuilder');

describe('IsolineBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new IsolineBuilder();
  });

  describe('Constructor', () => {
    test('creates instance with default EPSILON', () => {
      expect(builder).toBeInstanceOf(IsolineBuilder);
      expect(builder.EPSILON).toBe(0.000001);
    });

    test('initializes with correct properties', () => {
      expect(typeof builder.EPSILON).toBe('number');
      expect(builder.EPSILON).toBeGreaterThan(0);
    });
  });

  describe('buildIsolines', () => {
    test('builds isolines from simple segments', () => {
      const segments = [
        { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 0 }, level: 1000 },
        { p1: { lon: 1, lat: 0 }, p2: { lon: 1, lat: 1 }, level: 1000 },
        { p1: { lon: 1, lat: 1 }, p2: { lon: 0, lat: 1 }, level: 1000 },
        { p1: { lon: 0, lat: 1 }, p2: { lon: 0, lat: 0 }, level: 1000 }
      ];
      
      const isolines = builder.buildIsolines(segments);
      
      expect(Array.isArray(isolines)).toBe(true);
      expect(isolines.length).toBeGreaterThan(0);
      
      const isoline = isolines[0];
      expect(Array.isArray(isoline)).toBe(true);
      expect(isoline.level).toBe(1000);
    });

    test('handles empty segments array', () => {
      const isolines = builder.buildIsolines([]);
      
      expect(Array.isArray(isolines)).toBe(true);
      expect(isolines.length).toBe(0);
    });

    test('handles single segment', () => {
      const segments = [
        { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 1 }, level: 1000 }
      ];
      
      const isolines = builder.buildIsolines(segments);
      
      expect(Array.isArray(isolines)).toBe(true);
      expect(isolines.length).toBe(1);
      
      const isoline = isolines[0];
      expect(isoline.length).toBe(2);
      expect(isoline[0]).toEqual({ lon: 0, lat: 0 });
      expect(isoline[1]).toEqual({ lon: 1, lat: 1 });
      expect(isoline.level).toBe(1000);
    });

    test('builds closed polygon from connected segments', () => {
      const segments = [
        { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 0 }, level: 1000 },
        { p1: { lon: 1, lat: 0 }, p2: { lon: 1, lat: 1 }, level: 1000 },
        { p1: { lon: 1, lat: 1 }, p2: { lon: 0, lat: 1 }, level: 1000 },
        { p1: { lon: 0, lat: 1 }, p2: { lon: 0, lat: 0 }, level: 1000 }
      ];
      
      const isolines = builder.buildIsolines(segments);
      
      expect(isolines.length).toBe(1);
      
      const isoline = isolines[0];
      expect(builder.isClosed(isoline)).toBe(true);
      
      // Check that first and last points are the same
      const first = isoline[0];
      const last = isoline[isoline.length - 1];
      expect(builder.pointsEqual(first, last)).toBe(true);
    });

    test('handles disconnected segments', () => {
      const segments = [
        { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 0 }, level: 1000 },
        { p1: { lon: 5, lat: 5 }, p2: { lon: 6, lat: 5 }, level: 1000 }
      ];
      
      const isolines = builder.buildIsolines(segments);
      
      expect(isolines.length).toBe(2);
      
      isolines.forEach(isoline => {
        expect(isoline.level).toBe(1000);
        expect(isoline.length).toBe(2);
      });
    });

    test('handles multiple levels', () => {
      const segments = [
        { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 0 }, level: 1000 },
        { p1: { lon: 2, lat: 2 }, p2: { lon: 3, lat: 2 }, level: 1010 },
        { p1: { lon: 4, lat: 4 }, p2: { lon: 5, lat: 4 }, level: 1020 }
      ];
      
      const isolines = builder.buildIsolines(segments);
      
      expect(isolines.length).toBe(3);
      
      const levels = isolines.map(isoline => isoline.level);
      expect(levels).toContain(1000);
      expect(levels).toContain(1010);
      expect(levels).toContain(1020);
    });

    test('applies heuristic for segment selection', () => {
      // Create segments where multiple choices are available
      const segments = [
        { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 0 }, level: 1000 },
        { p1: { lon: 1, lat: 0 }, p2: { lon: 2, lat: 0 }, level: 1000 }, // Straight continuation
        { p1: { lon: 1, lat: 0 }, p2: { lon: 1, lat: 1 }, level: 1000 }  // Right turn
      ];
      
      const isolines = builder.buildIsolines(segments);
      
      expect(Array.isArray(isolines)).toBe(true);
      expect(isolines.length).toBeGreaterThan(0);
      
      // Should have used the heuristic to choose the best path
      isolines.forEach(isoline => {
        expect(isoline.level).toBe(1000);
        expect(isoline.length).toBeGreaterThan(1);
      });
    });

    test('handles segments with custom gridResolution', () => {
      const segments = [
        { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 0 }, level: 1000 },
        { p1: { lon: 2, lat: 0 }, p2: { lon: 3, lat: 0 }, level: 1000 }
      ];
      
      const gridResolution = 2.0;
      const isolines = builder.buildIsolines(segments, gridResolution);
      
      expect(Array.isArray(isolines)).toBe(true);
      expect(isolines.length).toBeGreaterThan(0);
    });

    test('prevents infinite loops with MAX_ITERATIONS', () => {
      // Create a complex network that could cause infinite loops
      const segments = [];
      for (let i = 0; i < 1000; i++) {
        segments.push({
          p1: { lon: i, lat: 0 },
          p2: { lon: i + 1, lat: 0 },
          level: 1000
        });
      }
      
      const startTime = Date.now();
      const isolines = builder.buildIsolines(segments);
      const endTime = Date.now();
      
      expect(Array.isArray(isolines)).toBe(true);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete in reasonable time
    });

    test('handles segments with very close but not identical endpoints', () => {
      const epsilon = builder.EPSILON;
      const segments = [
        { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 0 }, level: 1000 },
        { p1: { lon: 1 + epsilon/2, lat: epsilon/2 }, p2: { lon: 2, lat: 0 }, level: 1000 }
      ];
      
      const isolines = builder.buildIsolines(segments);
      
      expect(Array.isArray(isolines)).toBe(true);
      expect(isolines.length).toBeGreaterThan(0);
    });

    test('handles segments with identical points', () => {
      const segments = [
        { p1: { lon: 0, lat: 0 }, p2: { lon: 0, lat: 0 }, level: 1000 },
        { p1: { lon: 1, lat: 1 }, p2: { lon: 1, lat: 1 }, level: 1000 }
      ];
      
      const isolines = builder.buildIsolines(segments);
      
      expect(Array.isArray(isolines)).toBe(true);
      // Should handle gracefully, even if resulting isolines are degenerate
    });

    test('handles segments with missing level property', () => {
      const segments = [
        { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 0 } }, // Missing level
        { p1: { lon: 1, lat: 0 }, p2: { lon: 1, lat: 1 }, level: 1000 }
      ];
      
      expect(() => {
        builder.buildIsolines(segments);
      }).not.toThrow(); // Should handle gracefully
    });

    test('handles segments with invalid coordinates', () => {
      const segments = [
        { p1: { lon: NaN, lat: 0 }, p2: { lon: 1, lat: 0 }, level: 1000 },
        { p1: { lon: 0, lat: Infinity }, p2: { lon: 1, lat: 1 }, level: 1000 },
        { p1: { lon: 0, lat: 0 }, p2: { lon: undefined, lat: null }, level: 1000 }
      ];
      
      expect(() => {
        builder.buildIsolines(segments);
      }).not.toThrow(); // Should handle gracefully
    });
  });

  describe('mergeUnclosedIsolines', () => {
    test('merges two unclosed isolines that can connect', () => {
      const isolines = [
        [
          { lon: 0, lat: 0 },
          { lon: 1, lat: 0 }
        ],
        [
          { lon: 1, lat: 0 },
          { lon: 2, lat: 0 }
        ]
      ];
      
      isolines[0].level = 1000;
      isolines[1].level = 1000;
      
      const merged = builder.mergeUnclosedIsolines(isolines, 1.0);
      
      expect(Array.isArray(merged)).toBe(true);
      expect(merged.length).toBeLessThanOrEqual(isolines.length);
      
      // Should have merged into fewer isolines
      const totalPointsBefore = isolines.reduce((sum, iso) => sum + iso.length, 0);
      const totalPointsAfter = merged.reduce((sum, iso) => sum + iso.length, 0);
      
      expect(totalPointsAfter).toBeGreaterThanOrEqual(totalPointsBefore - 1); // -1 for merged point
    });

    test('does not merge isolines that are too far apart', () => {
      const isolines = [
        [
          { lon: 0, lat: 0 },
          { lon: 1, lat: 0 }
        ],
        [
          { lon: 10, lat: 10 }, // Far away
          { lon: 11, lat: 10 }
        ]
      ];
      
      isolines[0].level = 1000;
      isolines[1].level = 1000;
      
      const merged = builder.mergeUnclosedIsolines(isolines, 1.0);
      
      expect(merged.length).toBe(2); // Should remain separate
    });

    test('preserves closed isolines unchanged', () => {
      const closedIsoline = [
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 },
        { lon: 1, lat: 1 },
        { lon: 0, lat: 1 },
        { lon: 0, lat: 0 } // Closed
      ];
      closedIsoline.level = 1000;
      
      const unclosedIsoline = [
        { lon: 5, lat: 5 },
        { lon: 6, lat: 5 }
      ];
      unclosedIsoline.level = 1000;
      
      const isolines = [closedIsoline, unclosedIsoline];
      const merged = builder.mergeUnclosedIsolines(isolines, 1.0);
      
      expect(merged.length).toBe(2);
      
      // Find the closed isoline in the result
      const resultClosed = merged.find(iso => builder.isClosed(iso));
      expect(resultClosed).toBeDefined();
      expect(resultClosed.length).toBe(closedIsoline.length);
    });

    test('handles isolines with different levels separately', () => {
      const isolines = [
        [
          { lon: 0, lat: 0 },
          { lon: 1, lat: 0 }
        ],
        [
          { lon: 1, lat: 0 },
          { lon: 2, lat: 0 }
        ]
      ];
      
      isolines[0].level = 1000;
      isolines[1].level = 1010; // Different level
      
      const merged = builder.mergeUnclosedIsolines(isolines, 1.0);
      
      expect(merged.length).toBe(2); // Should not merge different levels
    });

    test('handles start-to-end connections', () => {
      const isolines = [
        [
          { lon: 1, lat: 0 },
          { lon: 0, lat: 0 }
        ],
        [
          { lon: 2, lat: 0 },
          { lon: 1, lat: 0 }
        ]
      ];
      
      isolines[0].level = 1000;
      isolines[1].level = 1000;
      
      const merged = builder.mergeUnclosedIsolines(isolines, 1.0);
      
      expect(merged.length).toBe(1);
      expect(merged[0].length).toBe(3); // Should have 3 points after merging
    });

    test('prevents infinite loops with MAX_MERGE_ITERATIONS', () => {
      // Create many small segments that could cause complex merging
      const isolines = [];
      for (let i = 0; i < 100; i++) {
        const isoline = [
          { lon: i, lat: 0 },
          { lon: i + 0.5, lat: 0 }
        ];
        isoline.level = 1000;
        isolines.push(isoline);
      }
      
      const startTime = Date.now();
      const merged = builder.mergeUnclosedIsolines(isolines, 1.0);
      const endTime = Date.now();
      
      expect(Array.isArray(merged)).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in reasonable time
    });

    test('handles empty isolines array', () => {
      const merged = builder.mergeUnclosedIsolines([], 1.0);
      
      expect(Array.isArray(merged)).toBe(true);
      expect(merged.length).toBe(0);
    });

    test('handles single isoline', () => {
      const isolines = [
        [
          { lon: 0, lat: 0 },
          { lon: 1, lat: 0 }
        ]
      ];
      isolines[0].level = 1000;
      
      const merged = builder.mergeUnclosedIsolines(isolines, 1.0);
      
      expect(merged.length).toBe(1);
      expect(merged[0]).toEqual(isolines[0]);
    });

    test('uses appropriate μ threshold', () => {
      const isolines = [
        [
          { lon: 0, lat: 0 },
          { lon: 1, lat: 0 }
        ],
        [
          { lon: 1.5, lat: 0 }, // 0.5 units away
          { lon: 2, lat: 0 }
        ]
      ];
      
      isolines[0].level = 1000;
      isolines[1].level = 1000;
      
      // With small threshold, should not merge
      const notMerged = builder.mergeUnclosedIsolines(isolines, 0.1);
      expect(notMerged.length).toBe(2);
      
      // With large threshold, should merge
      const merged = builder.mergeUnclosedIsolines(isolines, 1.0);
      expect(merged.length).toBe(1);
    });
  });

  describe('isClosed', () => {
    test('returns true for closed polygon', () => {
      const closedPoly = [
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 },
        { lon: 1, lat: 1 },
        { lon: 0, lat: 1 },
        { lon: 0, lat: 0 } // Same as first point
      ];
      
      expect(builder.isClosed(closedPoly)).toBe(true);
    });

    test('returns false for open polyline', () => {
      const openPoly = [
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 },
        { lon: 1, lat: 1 },
        { lon: 0, lat: 1 }
        // Does not return to start
      ];
      
      expect(builder.isClosed(openPoly)).toBe(false);
    });

    test('returns false for polygon with too few points', () => {
      const twoPoints = [
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 }
      ];
      
      expect(builder.isClosed(twoPoints)).toBe(false);
    });

    test('returns false for empty array', () => {
      expect(builder.isClosed([])).toBe(false);
    });

    test('returns false for single point', () => {
      const singlePoint = [{ lon: 0, lat: 0 }];
      
      expect(builder.isClosed(singlePoint)).toBe(false);
    });

    test('handles points that are very close but not identical', () => {
      const epsilon = builder.EPSILON;
      const almostClosed = [
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 },
        { lon: 1, lat: 1 },
        { lon: 0, lat: 1 },
        { lon: epsilon/2, lat: epsilon/2 } // Very close to first point
      ];
      
      expect(builder.isClosed(almostClosed)).toBe(true);
    });

    test('handles points that are close but beyond epsilon', () => {
      const epsilon = builder.EPSILON;
      const notQuiteClosed = [
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 },
        { lon: 1, lat: 1 },
        { lon: 0, lat: 1 },
        { lon: epsilon * 2, lat: epsilon * 2 } // Beyond epsilon threshold
      ];
      
      expect(builder.isClosed(notQuiteClosed)).toBe(false);
    });
  });

  describe('pointsEqual', () => {
    test('returns true for identical points', () => {
      const p1 = { lon: 1.5, lat: 2.5 };
      const p2 = { lon: 1.5, lat: 2.5 };
      
      expect(builder.pointsEqual(p1, p2)).toBe(true);
    });

    test('returns false for different points', () => {
      const p1 = { lon: 1.5, lat: 2.5 };
      const p2 = { lon: 3.5, lat: 4.5 };
      
      expect(builder.pointsEqual(p1, p2)).toBe(false);
    });

    test('returns true for points within epsilon tolerance', () => {
      const epsilon = builder.EPSILON;
      const p1 = { lon: 1.0, lat: 2.0 };
      const p2 = { lon: 1.0 + epsilon/2, lat: 2.0 + epsilon/2 };
      
      expect(builder.pointsEqual(p1, p2)).toBe(true);
    });

    test('returns false for points beyond epsilon tolerance', () => {
      const epsilon = builder.EPSILON;
      const p1 = { lon: 1.0, lat: 2.0 };
      const p2 = { lon: 1.0 + epsilon * 2, lat: 2.0 + epsilon * 2 };
      
      expect(builder.pointsEqual(p1, p2)).toBe(false);
    });

    test('handles negative coordinates', () => {
      const p1 = { lon: -1.5, lat: -2.5 };
      const p2 = { lon: -1.5, lat: -2.5 };
      
      expect(builder.pointsEqual(p1, p2)).toBe(true);
    });

    test('handles very large coordinates', () => {
      const p1 = { lon: 1e10, lat: 1e10 };
      const p2 = { lon: 1e10, lat: 1e10 };
      
      expect(builder.pointsEqual(p1, p2)).toBe(true);
    });

    test('handles very small coordinates', () => {
      const p1 = { lon: 1e-10, lat: 1e-10 };
      const p2 = { lon: 1e-10, lat: 1e-10 };
      
      expect(builder.pointsEqual(p1, p2)).toBe(true);
    });

    test('handles missing properties gracefully', () => {
      const p1 = { lon: 1.0 }; // Missing lat
      const p2 = { lat: 2.0 }; // Missing lon
      
      expect(() => {
        builder.pointsEqual(p1, p2);
}).not.toThrow(); // Should handle gracefully
});

test('handles null and undefined points', () => {
  const p1 = { lon: 1.0, lat: 2.0 };
  
  expect(() => {
    builder.pointsEqual(p1, null);
  }).not.toThrow();
  
  expect(() => {
    builder.pointsEqual(null, p1);
  }).not.toThrow();
  
  expect(() => {
    builder.pointsEqual(undefined, undefined);
  }).not.toThrow();
});

test('handles NaN coordinates', () => {
  const p1 = { lon: NaN, lat: 2.0 };
  const p2 = { lon: 1.0, lat: NaN };
  
  expect(() => {
    builder.pointsEqual(p1, p2);
  }).not.toThrow();
});

test('handles Infinity coordinates', () => {
  const p1 = { lon: Infinity, lat: 2.0 };
  const p2 = { lon: Infinity, lat: 2.0 };
  
  expect(() => {
    builder.pointsEqual(p1, p2);
  }).not.toThrow();
});
});

describe('hashPoint', () => {
test('generates consistent hash for same point', () => {
  const point = { lon: 1.123456, lat: 2.654321 };
  
  const hash1 = builder.hashPoint(point);
  const hash2 = builder.hashPoint(point);
  
  expect(hash1).toBe(hash2);
  expect(typeof hash1).toBe('string');
});

test('generates different hashes for different points', () => {
  const p1 = { lon: 1.123456, lat: 2.654321 };
  const p2 = { lon: 3.789012, lat: 4.345678 };
  
  const hash1 = builder.hashPoint(p1);
  const hash2 = builder.hashPoint(p2);
  
  expect(hash1).not.toBe(hash2);
});

test('uses fixed precision for hashing', () => {
  const p1 = { lon: 1.1234567890, lat: 2.9876543210 };
  const p2 = { lon: 1.1234569999, lat: 2.9876549999 }; // Very close but different
  
  const hash1 = builder.hashPoint(p1);
  const hash2 = builder.hashPoint(p2);
  
  // Should be the same due to fixed precision (6 decimal places)
  expect(hash1).toBe(hash2);
});

test('handles negative coordinates', () => {
  const point = { lon: -1.123456, lat: -2.654321 };
  
  const hash = builder.hashPoint(point);
  
  expect(typeof hash).toBe('string');
  expect(hash).toContain('-1.123456');
  expect(hash).toContain('-2.654321');
});

test('handles zero coordinates', () => {
  const point = { lon: 0, lat: 0 };
  
  const hash = builder.hashPoint(point);
  
  expect(typeof hash).toBe('string');
  expect(hash).toBe('0.000000,0.000000');
});

test('handles very large coordinates', () => {
  const point = { lon: 1e10, lat: 1e10 };
  
  const hash = builder.hashPoint(point);
  
  expect(typeof hash).toBe('string');
  expect(hash.length).toBeGreaterThan(0);
});

test('handles very small coordinates', () => {
  const point = { lon: 1e-10, lat: 1e-10 };
  
  const hash = builder.hashPoint(point);
  
  expect(typeof hash).toBe('string');
  expect(hash.length).toBeGreaterThan(0);
});

test('handles missing properties gracefully', () => {
  const invalidPoints = [
    { lon: 1.0 }, // Missing lat
    { lat: 2.0 }, // Missing lon
    {}, // Missing both
    null,
    undefined
  ];
  
  invalidPoints.forEach(point => {
    expect(() => {
      builder.hashPoint(point);
    }).not.toThrow();
  });
});

test('handles NaN coordinates', () => {
  const point = { lon: NaN, lat: NaN };
  
  expect(() => {
    builder.hashPoint(point);
  }).not.toThrow();
});

test('handles Infinity coordinates', () => {
  const point = { lon: Infinity, lat: -Infinity };
  
  expect(() => {
    builder.hashPoint(point);
  }).not.toThrow();
});
});

describe('distance', () => {
test('calculates distance between two points', () => {
  const p1 = { lon: 0, lat: 0 };
  const p2 = { lon: 3, lat: 4 };
  
  const dist = builder.distance(p1, p2);
  
  expect(dist).toBe(5); // 3-4-5 triangle
});

test('returns zero for identical points', () => {
  const p1 = { lon: 1.5, lat: 2.5 };
  const p2 = { lon: 1.5, lat: 2.5 };
  
  const dist = builder.distance(p1, p2);
  
  expect(dist).toBe(0);
});

test('handles negative coordinates', () => {
  const p1 = { lon: -3, lat: -4 };
  const p2 = { lon: 0, lat: 0 };
  
  const dist = builder.distance(p1, p2);
  
  expect(dist).toBe(5);
});

test('calculates distance correctly for small differences', () => {
  const p1 = { lon: 0, lat: 0 };
  const p2 = { lon: 0.001, lat: 0.001 };
  
  const dist = builder.distance(p1, p2);
  
  expect(dist).toBeCloseTo(Math.sqrt(0.000002), 10);
});

test('calculates distance correctly for large coordinates', () => {
  const p1 = { lon: 1000000, lat: 1000000 };
  const p2 = { lon: 1000003, lat: 1000004 };
  
  const dist = builder.distance(p1, p2);
  
  expect(dist).toBe(5);
});

test('handles missing properties gracefully', () => {
  const p1 = { lon: 1.0 }; // Missing lat
  const p2 = { lat: 2.0 }; // Missing lon
  
  expect(() => {
    builder.distance(p1, p2);
  }).not.toThrow();
});

test('handles NaN coordinates', () => {
  const p1 = { lon: NaN, lat: 0 };
  const p2 = { lon: 0, lat: NaN };
  
  const dist = builder.distance(p1, p2);
  
  expect(isNaN(dist)).toBe(true);
});

test('handles Infinity coordinates', () => {
  const p1 = { lon: Infinity, lat: 0 };
  const p2 = { lon: 0, lat: 0 };
  
  const dist = builder.distance(p1, p2);
  
  expect(dist).toBe(Infinity);
});

test('is symmetric', () => {
  const p1 = { lon: 1, lat: 2 };
  const p2 = { lon: 4, lat: 6 };
  
  const dist1 = builder.distance(p1, p2);
  const dist2 = builder.distance(p2, p1);
  
  expect(dist1).toBe(dist2);
});

test('satisfies triangle inequality', () => {
  const p1 = { lon: 0, lat: 0 };
  const p2 = { lon: 1, lat: 1 };
  const p3 = { lon: 2, lat: 0 };
  
  const d12 = builder.distance(p1, p2);
  const d23 = builder.distance(p2, p3);
  const d13 = builder.distance(p1, p3);
  
  expect(d13).toBeLessThanOrEqual(d12 + d23);
});
});

describe('Integration Tests', () => {
test('builds complex multi-level isolines', () => {
  const segments = [];
  
  // Create segments for multiple levels
  for (let level = 1000; level <= 1020; level += 10) {
    const offset = (level - 1000) / 10;
    segments.push(
      { p1: { lon: offset, lat: offset }, p2: { lon: offset + 1, lat: offset }, level },
      { p1: { lon: offset + 1, lat: offset }, p2: { lon: offset + 1, lat: offset + 1 }, level },
      { p1: { lon: offset + 1, lat: offset + 1 }, p2: { lon: offset, lat: offset + 1 }, level },
      { p1: { lon: offset, lat: offset + 1 }, p2: { lon: offset, lat: offset }, level }
    );
  }
  
  const isolines = builder.buildIsolines(segments);
  
  expect(isolines.length).toBe(3); // Three levels
  
  isolines.forEach(isoline => {
    expect(builder.isClosed(isoline)).toBe(true);
    expect([1000, 1010, 1020]).toContain(isoline.level);
  });
});

test('handles realistic contour data', () => {
  // Simulate segments from a real contour algorithm
  const segments = [
    { p1: { lon: 0.5, lat: 0 }, p2: { lon: 1, lat: 0.5 }, level: 1000 },
    { p1: { lon: 1, lat: 0.5 }, p2: { lon: 0.5, lat: 1 }, level: 1000 },
    { p1: { lon: 0.5, lat: 1 }, p2: { lon: 0, lat: 0.5 }, level: 1000 },
    { p1: { lon: 0, lat: 0.5 }, p2: { lon: 0.5, lat: 0 }, level: 1000 }
  ];
  
  const isolines = builder.buildIsolines(segments);
  
  expect(isolines.length).toBe(1);
  expect(builder.isClosed(isolines[0])).toBe(true);
  expect(isolines[0].level).toBe(1000);
});

test('handles branching and merging isolines', () => {
  // Create a Y-shaped configuration
  const segments = [
    { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 1 }, level: 1000 },
    { p1: { lon: 1, lat: 1 }, p2: { lon: 2, lat: 0 }, level: 1000 },
    { p1: { lon: 1, lat: 1 }, p2: { lon: 1, lat: 2 }, level: 1000 }
  ];
  
  const isolines = builder.buildIsolines(segments);
  
  expect(Array.isArray(isolines)).toBe(true);
  expect(isolines.length).toBeGreaterThan(0);
  
  isolines.forEach(isoline => {
    expect(isoline.level).toBe(1000);
  });
});

test('performance with large number of segments', () => {
  const segments = [];
  
  // Create a grid of segments
  for (let i = 0; i < 100; i++) {
    for (let j = 0; j < 100; j++) {
      segments.push({
        p1: { lon: i, lat: j },
        p2: { lon: i + 1, lat: j },
        level: 1000
      });
    }
  }
  
  const startTime = performance.now();
  const isolines = builder.buildIsolines(segments);
  const endTime = performance.now();
  
  expect(Array.isArray(isolines)).toBe(true);
  expect(endTime - startTime).toBeLessThan(5000); // Should complete in reasonable time
});

test('memory efficiency with large datasets', () => {
  const initialMemory = process.memoryUsage().heapUsed;
  
  const segments = [];
  for (let i = 0; i < 1000; i++) {
    segments.push({
      p1: { lon: Math.random() * 100, lat: Math.random() * 100 },
      p2: { lon: Math.random() * 100, lat: Math.random() * 100 },
      level: 1000 + Math.floor(Math.random() * 5) * 10
    });
  }
  
  const isolines = builder.buildIsolines(segments);
  
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = finalMemory - initialMemory;
  
  expect(Array.isArray(isolines)).toBe(true);
  expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
});

test('handles edge cases in real-world scenarios', () => {
  // Mix of closed and open isolines, multiple levels, various complexities
  const segments = [
    // Closed square at level 1000
    { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 0 }, level: 1000 },
    { p1: { lon: 1, lat: 0 }, p2: { lon: 1, lat: 1 }, level: 1000 },
    { p1: { lon: 1, lat: 1 }, p2: { lon: 0, lat: 1 }, level: 1000 },
    { p1: { lon: 0, lat: 1 }, p2: { lon: 0, lat: 0 }, level: 1000 },
    
    // Open line at level 1010
    { p1: { lon: 5, lat: 5 }, p2: { lon: 6, lat: 5 }, level: 1010 },
    { p1: { lon: 6, lat: 5 }, p2: { lon: 7, lat: 6 }, level: 1010 },
    
    // Disconnected segments at level 1020
    { p1: { lon: 10, lat: 10 }, p2: { lon: 11, lat: 10 }, level: 1020 },
    { p1: { lon: 15, lat: 15 }, p2: { lon: 16, lat: 15 }, level: 1020 }
  ];
  
  const isolines = builder.buildIsolines(segments);
  
  expect(Array.isArray(isolines)).toBe(true);
  expect(isolines.length).toBeGreaterThan(0);
  
  // Check that we have isolines for all levels
  const levels = isolines.map(iso => iso.level);
  expect(levels).toContain(1000);
  expect(levels).toContain(1010);
  expect(levels).toContain(1020);
  
  // Check that the closed polygon is properly closed
  const closedIsolines = isolines.filter(iso => builder.isClosed(iso));
  expect(closedIsolines.length).toBeGreaterThan(0);
});

test('maintains data integrity throughout processing', () => {
  const originalSegments = [
    { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 0 }, level: 1000 },
    { p1: { lon: 1, lat: 0 }, p2: { lon: 1, lat: 1 }, level: 1000 }
  ];
  
  // Deep copy to check if original is modified
  const segmentsCopy = JSON.parse(JSON.stringify(originalSegments));
  
  const isolines = builder.buildIsolines(originalSegments);
  
  // Original segments should not be modified
  expect(originalSegments).toEqual(segmentsCopy);
  
  // Isolines should have proper structure
  expect(Array.isArray(isolines)).toBe(true);
  isolines.forEach(isoline => {
    expect(Array.isArray(isoline)).toBe(true);
    expect(typeof isoline.level).toBe('number');
    
    isoline.forEach(point => {
      expect(typeof point.lon).toBe('number');
      expect(typeof point.lat).toBe('number');
    });
  });
});
});

describe('Error Handling and Robustness', () => {
test('handles malformed segment objects', () => {
  const malformedSegments = [
    { p1: { lon: 0, lat: 0 } }, // Missing p2
    { p2: { lon: 1, lat: 1 } }, // Missing p1
    { p1: { lon: 0 }, p2: { lon: 1, lat: 1 } }, // Missing lat in p1
    { p1: { lat: 0 }, p2: { lon: 1, lat: 1 } }, // Missing lon in p1
    {}, // Empty object
    null,
    undefined,
    "invalid"
  ];
  
  expect(() => {
    builder.buildIsolines(malformedSegments);
  }).not.toThrow(); // Should handle gracefully
});

test('handles extreme coordinate values', () => {
  const extremeSegments = [
    { p1: { lon: Number.MAX_VALUE, lat: 0 }, p2: { lon: 0, lat: Number.MAX_VALUE }, level: 1000 },
    { p1: { lon: Number.MIN_VALUE, lat: 0 }, p2: { lon: 0, lat: Number.MIN_VALUE }, level: 1000 },
    { p1: { lon: Infinity, lat: 0 }, p2: { lon: 0, lat: Infinity }, level: 1000 },
    { p1: { lon: -Infinity, lat: 0 }, p2: { lon: 0, lat: -Infinity }, level: 1000 }
  ];
  
  expect(() => {
    builder.buildIsolines(extremeSegments);
  }).not.toThrow(); // Should handle gracefully
});

test('handles circular references in segment connections', () => {
  // Create segments that could form circular references
  const circularSegments = [
    { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 0 }, level: 1000 },
    { p1: { lon: 1, lat: 0 }, p2: { lon: 0, lat: 0 }, level: 1000 } // Back to start immediately
  ];
  
  const isolines = builder.buildIsolines(circularSegments);
  
  expect(Array.isArray(isolines)).toBe(true);
  // Should handle without infinite loops
});

test('handles very dense segment networks', () => {
  const denseSegments = [];
  
  // Create a very dense grid of interconnected segments
  for (let i = 0; i < 50; i++) {
    for (let j = 0; j < 50; j++) {
      denseSegments.push(
        { p1: { lon: i, lat: j }, p2: { lon: i + 1, lat: j }, level: 1000 },
        { p1: { lon: i, lat: j }, p2: { lon: i, lat: j + 1 }, level: 1000 }
      );
    }
  }
  
  const startTime = performance.now();
  const isolines = builder.buildIsolines(denseSegments);
  const endTime = performance.now();
  
  expect(Array.isArray(isolines)).toBe(true);
  expect(endTime - startTime).toBeLessThan(10000); // Should complete in reasonable time
});

test('maintains consistent behavior across multiple calls', () => {
  const segments = [
    { p1: { lon: 0, lat: 0 }, p2: { lon: 1, lat: 0 }, level: 1000 },
    { p1: { lon: 1, lat: 0 }, p2: { lon: 1, lat: 1 }, level: 1000 },
    { p1: { lon: 1, lat: 1 }, p2: { lon: 0, lat: 1 }, level: 1000 },
    { p1: { lon: 0, lat: 1 }, p2: { lon: 0, lat: 0 }, level: 1000 }
  ];
  
  const result1 = builder.buildIsolines(segments);
  const result2 = builder.buildIsolines(segments);
  const result3 = builder.buildIsolines(segments);
  
  // Results should be consistent
  expect(result1.length).toBe(result2.length);
  expect(result2.length).toBe(result3.length);
  
  // Structure should be the same
  for (let i = 0; i < result1.length; i++) {
    expect(result1[i].length).toBe(result2[i].length);
    expect(result2[i].length).toBe(result3[i].length);
    expect(result1[i].level).toBe(result2[i].level);
    expect(result2[i].level).toBe(result3[i].level);
  }
});
});
});

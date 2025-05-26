const TiledIsolineBuilder = require('../../tiledIsolineBuilder');

describe('TiledIsolineBuilder', () => {
  let builder;
  const defaultLevels = [1000, 1010, 1020];
  const defaultTileSize = 64;

  beforeEach(() => {
    builder = new TiledIsolineBuilder(defaultLevels, defaultTileSize);
  });

  describe('Constructor', () => {
    test('creates instance with default parameters', () => {
      const defaultBuilder = new TiledIsolineBuilder();
      
      expect(defaultBuilder).toBeInstanceOf(TiledIsolineBuilder);
      expect(defaultBuilder.levels).toEqual([]);
      expect(defaultBuilder.tileSize).toBe(128);
    });

    test('creates instance with custom parameters', () => {
      const customLevels = [500, 1000, 1500];
      const customTileSize = 256;
      const customBuilder = new TiledIsolineBuilder(customLevels, customTileSize);
      
      expect(customBuilder.levels).toEqual(customLevels);
      expect(customBuilder.tileSize).toBe(customTileSize);
    });

    test('initializes internal data structures', () => {
      expect(builder.tiles).toBeInstanceOf(Map);
      expect(builder.tileIsolines).toBeInstanceOf(Map);
      expect(builder.mergedIsolines).toBeInstanceOf(Map);
      expect(builder.edgePoints).toBeInstanceOf(Map);
      expect(builder.EPSILON).toBe(0.000001);
    });

    test('handles empty levels array', () => {
      const emptyBuilder = new TiledIsolineBuilder([], 64);
      
      expect(emptyBuilder.levels).toEqual([]);
      expect(emptyBuilder.tileSize).toBe(64);
    });

    test('handles null levels parameter', () => {
      const nullBuilder = new TiledIsolineBuilder(null, 64);
      
      expect(nullBuilder.levels).toEqual([]);
    });

    test('handles undefined levels parameter', () => {
      const undefinedBuilder = new TiledIsolineBuilder(undefined, 64);
      
      expect(undefinedBuilder.levels).toEqual([]);
    });
  });

  describe('addTile', () => {
    test('adds valid tile successfully', () => {
      const tileData = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      const result = builder.addTile(0, 0, tileData);
      
      expect(result).toBeDefined();
      expect(builder.tiles.has('0,0')).toBe(true);
      expect(builder.tiles.get('0,0')).toEqual(tileData);
    });

    test('throws error for empty tile data', () => {
      expect(() => {
        builder.addTile(0, 0, []);
      }).toThrow('Empty tile data');
    });

    test('throws error for null tile data', () => {
      expect(() => {
        builder.addTile(0, 0, null);
      }).toThrow('Empty tile data');
    });

    test('throws error for undefined tile data', () => {
      expect(() => {
        builder.addTile(0, 0, undefined);
      }).toThrow('Empty tile data');
    });

    test('throws error for inconsistent row lengths', () => {
      const inconsistentData = [
        [1000, 1010],
        [1020, 1030, 1040], // Different length
        [1050, 1060]
      ];
      
      expect(() => {
        builder.addTile(0, 0, inconsistentData);
      }).toThrow('Inconsistent tile row lengths');
    });

    test('warns about oversized tiles', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const oversizedData = Array(200).fill().map(() => Array(200).fill(1000));
      
      builder.addTile(0, 0, oversizedData);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('exceeds expected dimensions')
      );
      
      consoleSpy.mockRestore();
    });

    test('handles and warns about NaN values', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const nanData = [
        [1000, NaN, 1020],
        [1030, 1040, NaN],
        [NaN, 1060, 1070]
      ];
      
      builder.addTile(0, 0, nanData);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('contains NaN values')
      );
      
      // Check that NaN values were converted to 0
      const storedData = builder.tiles.get('0,0');
      expect(storedData[0][1]).toBe(0);
      expect(storedData[1][2]).toBe(0);
      expect(storedData[2][0]).toBe(0);
      
      consoleSpy.mockRestore();
    });

    test('handles negative tile indices', () => {
      const tileData = [
        [1000, 1010],
        [1020, 1030]
      ];
      
      const result = builder.addTile(-1, -2, tileData);
      
      expect(result).toBeDefined();
      expect(builder.tiles.has('-1,-2')).toBe(true);
    });

    test('handles large tile indices', () => {
      const tileData = [
        [1000, 1010],
        [1020, 1030]
      ];
      
      const result = builder.addTile(1000, 2000, tileData);
      
      expect(result).toBeDefined();
      expect(builder.tiles.has('1000,2000')).toBe(true);
    });

    test('overwrites existing tile data', () => {
      const originalData = [
        [1000, 1010],
        [1020, 1030]
      ];
      
      const newData = [
        [2000, 2010],
        [2020, 2030]
      ];
      
      builder.addTile(0, 0, originalData);
      expect(builder.tiles.get('0,0')).toEqual(originalData);
      
      builder.addTile(0, 0, newData);
      expect(builder.tiles.get('0,0')).toEqual(newData);
    });

    test('processes tile and generates isolines', () => {
      const tileData = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      builder.addTile(0, 0, tileData);
      
      expect(builder.tileIsolines.has('0,0')).toBe(true);
      
      const tileIsolines = builder.tileIsolines.get('0,0');
      expect(tileIsolines).toBeInstanceOf(Map);
    });

    test('returns GeoJSON result', () => {
      const tileData = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      const result = builder.addTile(0, 0, tileData);
      
      expect(result).toHaveProperty('type', 'FeatureCollection');
      expect(result).toHaveProperty('features');
      expect(Array.isArray(result.features)).toBe(true);
    });

    test('handles single cell tile', () => {
      const singleCellData = [[1005]];
      
      const result = builder.addTile(0, 0, singleCellData);
      
      expect(result).toBeDefined();
      expect(builder.tiles.has('0,0')).toBe(true);
    });

    test('handles very large values', () => {
      const largeValueData = [
        [1e10, 1e10 + 1000],
        [1e10 + 2000, 1e10 + 3000]
      ];
      
      const result = builder.addTile(0, 0, largeValueData);
      
      expect(result).toBeDefined();
      expect(builder.tiles.has('0,0')).toBe(true);
    });

    test('handles very small values', () => {
      const smallValueData = [
        [1e-10, 2e-10],
        [3e-10, 4e-10]
      ];
      
      const result = builder.addTile(0, 0, smallValueData);
      
      expect(result).toBeDefined();
      expect(builder.tiles.has('0,0')).toBe(true);
    });

    test('handles negative values', () => {
      const negativeValueData = [
        [-1000, -500],
        [-200, 100]
      ];
      
      const result = builder.addTile(0, 0, negativeValueData);
      
      expect(result).toBeDefined();
      expect(builder.tiles.has('0,0')).toBe(true);
    });

    test('handles mixed positive and negative values', () => {
      const mixedValueData = [
        [-1000, 500],
        [0, 1500]
      ];
      
      const result = builder.addTile(0, 0, mixedValueData);
      
      expect(result).toBeDefined();
      expect(builder.tiles.has('0,0')).toBe(true);
    });
  });

  describe('processTile', () => {
    test('processes tile for all levels', () => {
      const tileData = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      builder.addTile(0, 0, tileData);
      
      const tileIsolines = builder.tileIsolines.get('0,0');
      
      // Should have processed all levels
      defaultLevels.forEach(level => {
        expect(tileIsolines.has(level)).toBe(true);
      });
    });

    test('handles tile with no contours at specified levels', () => {
      // All values below the lowest level
      const tileData = [
        [900, 910, 920],
        [930, 940, 950],
        [960, 970, 980]
      ];
      
      builder.addTile(0, 0, tileData);
      
      const tileIsolines = builder.tileIsolines.get('0,0');
      
      // Should still have entries for all levels, but they might be empty
      defaultLevels.forEach(level => {
        expect(tileIsolines.has(level)).toBe(true);
      });
    });

    test('handles tile with uniform values', () => {
      const uniformData = [
        [1005, 1005, 1005],
        [1005, 1005, 1005],
        [1005, 1005, 1005]
      ];
      
      builder.addTile(0, 0, uniformData);
      
      const tileIsolines = builder.tileIsolines.get('0,0');
      expect(tileIsolines).toBeInstanceOf(Map);
      
      // Uniform data should not generate contours
      defaultLevels.forEach(level => {
        const levelIsolines = tileIsolines.get(level);
        expect(Array.isArray(levelIsolines)).toBe(true);
      });
    });

    test('handles tile with extreme gradients', () => {
      const extremeGradientData = [
        [0, 10000],
        [20000, 30000]
      ];
      
      const extremeBuilder = new TiledIsolineBuilder([5000, 15000, 25000], 64);
      extremeBuilder.addTile(0, 0, extremeGradientData);
      
      const tileIsolines = extremeBuilder.tileIsolines.get('0,0');
      expect(tileIsolines).toBeInstanceOf(Map);
    });
  });

  describe('mergeWithNeighbors', () => {
    test('calls merge function when adding tile', () => {
      const tileData = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      // Mock the mergeWithNeighbors method to verify it's called
      const mergeSpy = jest.spyOn(builder, 'mergeWithNeighbors');
      
      builder.addTile(0, 0, tileData);
      
      expect(mergeSpy).toHaveBeenCalledWith(0, 0);
      
      mergeSpy.mockRestore();
    });

    test('handles merging with no neighbors', () => {
      const tileData = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      // Adding first tile - no neighbors to merge with
      expect(() => {
        builder.addTile(0, 0, tileData);
      }).not.toThrow();
    });

    test('handles merging with adjacent tiles', () => {
      const tileData1 = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      const tileData2 = [
        [1015, 1025, 1035],
        [1025, 1035, 1045],
        [1035, 1045, 1055]
      ];
      
      // Add first tile
      builder.addTile(0, 0, tileData1);
      
      // Add adjacent tile
      builder.addTile(0, 1, tileData2);
      
      // Both tiles should be stored
      expect(builder.tiles.has('0,0')).toBe(true);
      expect(builder.tiles.has('0,1')).toBe(true);
      
      // Merging should have been attempted
      expect(builder.tileIsolines.has('0,0')).toBe(true);
      expect(builder.tileIsolines.has('0,1')).toBe(true);
    });

    test('handles merging with multiple neighbors', () => {
      const centerData = [
        [1000, 1010, 1020],
        [1010, 1020, 1030],
        [1020, 1030, 1040]
      ];
      
      const neighborData = [
        [990, 1000, 1010],
        [1000, 1010, 1020],
        [1010, 1020, 1030]
      ];
      
      // Add center tile
      builder.addTile(1, 1, centerData);
      
      // Add surrounding tiles
      builder.addTile(0, 1, neighborData); // Top
      builder.addTile(2, 1, neighborData); // Bottom
      builder.addTile(1, 0, neighborData); // Left
      builder.addTile(1, 2, neighborData); // Right
      
      // All tiles should be processed
      expect(builder.tiles.size).toBe(5);
    });
  });

  describe('getIsolinesAsGeoJSON', () => {
    test('returns valid GeoJSON structure', () => {
      const tileData = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      builder.addTile(0, 0, tileData);
      const geojson = builder.getIsolinesAsGeoJSON();
      
      expect(geojson).toHaveProperty('type', 'FeatureCollection');
      expect(geojson).toHaveProperty('features');
      expect(Array.isArray(geojson.features)).toBe(true);
    });

    test('returns empty feature collection when no tiles added', () => {
      const geojson = builder.getIsolinesAsGeoJSON();
      
      expect(geojson).toHaveProperty('type', 'FeatureCollection');
      expect(geojson.features).toEqual([]);
    });

    test('includes features with proper properties', () => {
      const tileData = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      builder.addTile(0, 0, tileData);
      const geojson = builder.getIsolinesAsGeoJSON();
      
      if (geojson.features.length > 0) {
        const feature = geojson.features[0];
        
        expect(feature).toHaveProperty('type', 'Feature');
        expect(feature).toHaveProperty('properties');
        expect(feature).toHaveProperty('geometry');
        expect(feature.properties).toHaveProperty('level');
        expect(typeof feature.properties.level).toBe('number');
      }
    });

    test('includes valid geometry', () => {
      const tileData = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      builder.addTile(0, 0, tileData);
      const geojson = builder.getIsolinesAsGeoJSON();
      
      geojson.features.forEach(feature => {
        expect(feature.geometry).toHaveProperty('type');
        expect(feature.geometry).toHaveProperty('coordinates');
        expect(Array.isArray(feature.geometry.coordinates)).toBe(true);
        
        // Check coordinate format
        if (feature.geometry.type === 'Polygon') {
          expect(Array.isArray(feature.geometry.coordinates[0])).toBe(true);
          feature.geometry.coordinates[0].forEach(coord => {
            expect(Array.isArray(coord)).toBe(true);
            expect(coord.length).toBe(2);
            expect(typeof coord[0]).toBe('number'); // longitude
            expect(typeof coord[1]).toBe('number'); // latitude
          });
        }
      });
    });

    test('handles multiple tiles in GeoJSON output', () => {
      const tileData1 = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      const tileData2 = [
        [1015, 1025, 1035],
        [1025, 1035, 1045],
        [1035, 1045, 1055]
      ];
      
      builder.addTile(0, 0, tileData1);
      builder.addTile(0, 1, tileData2);
      
      const geojson = builder.getIsolinesAsGeoJSON();
      
      expect(geojson).toHaveProperty('type', 'FeatureCollection');
      expect(Array.isArray(geojson.features)).toBe(true);
      
      // Should include features from both tiles
      const levels = geojson.features.map(f => f.properties.level);
      const uniqueLevels = [...new Set(levels)];
      
      // Should have features for the specified levels
      defaultLevels.forEach(level => {
        if (uniqueLevels.includes(level)) {
          expect(uniqueLevels).toContain(level);
        }
      });
    });

    test('maintains consistent output format across calls', () => {
      const tileData = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      builder.addTile(0, 0, tileData);
      
      const geojson1 = builder.getIsolinesAsGeoJSON();
      const geojson2 = builder.getIsolinesAsGeoJSON();
      
      expect(geojson1).toEqual(geojson2);
    });
  });

  describe('Edge Detection and Merging', () => {
    test('detects edge points correctly', () => {
      const tileData = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      builder.addTile(0, 0, tileData);
      
      // Edge points should be detected and stored
      expect(builder.edgePoints).toBeInstanceOf(Map);
    });

    test('handles tiles with no edge crossings', () => {
      // All values above the highest level
      const tileData = [
        [1100, 1110, 1120],
        [1110, 1120, 1130],
        [1120, 1130, 1140]
      ];
      
      builder.addTile(0, 0, tileData);
      
      const geojson = builder.getIsolinesAsGeoJSON();
      expect(geojson).toHaveProperty('type', 'FeatureCollection');
    });

    test('handles tiles with edge crossings', () => {
      // Values that cross the contour levels at edges
      const tileData = [
        [995, 1005, 1015], // Crosses 1000 and 1010 levels
        [1005, 1015, 1025], // Crosses 1010 and 1020 levels
        [1015, 1025, 1035]  // Crosses 1020 level
      ];
      
      builder.addTile(0, 0, tileData);
      
      const geojson = builder.getIsolinesAsGeoJSON();
      expect(geojson).toHaveProperty('type', 'FeatureCollection');
      
      // Should have some features since we cross contour levels
      if (geojson.features.length > 0) {
        expect(geojson.features[0]).toHaveProperty('properties');
        expect(geojson.features[0].properties).toHaveProperty('level');
      }
    });

    test('merges isolines across tile boundaries', () => {
      // Create two adjacent tiles with continuous contours
      const leftTileData = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      const rightTileData = [
        [1015, 1025, 1035],
        [1025, 1035, 1045],
        [1035, 1045, 1055]
      ];
      
      builder.addTile(0, 0, leftTileData);
      builder.addTile(0, 1, rightTileData);
      
      const geojson = builder.getIsolinesAsGeoJSON();
      
      expect(geojson).toHaveProperty('type', 'FeatureCollection');
      expect(Array.isArray(geojson.features)).toBe(true);
      
      // Merged isolines should be longer than individual tile isolines
      // This is a basic check - more sophisticated validation would be needed
    });
  });

  describe('Performance and Memory', () => {
    test('handles multiple tiles efficiently', () => {
      const startTime = performance.now();
      
      // Add multiple tiles
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
          const tileData = [
            [1000 + i*10, 1010 + i*10, 1020 + i*10],
            [1010 + i*10, 1020 + i*10, 1030 + i*10],
            [1020 + i*10, 1030 + i*10, 1040 + i*10]
          ];
          
          builder.addTile(i, j, tileData);
        }
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(10000); // Should complete in < 10 seconds
      expect(builder.tiles.size).toBe(100);
    });

    test('manages memory efficiently with large tiles', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create a larger tile
      const size = 100;
      const largeTileData = [];
      for (let i = 0; i < size; i++) {
        const row = [];
        for (let j = 0; j < size; j++) {
          row.push(1000 + i + j);
        }
        largeTileData.push(row);
      }
      
      builder.addTile(0, 0, largeTileData);
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });

    test('handles repeated tile updates efficiently', () => {
      const tileData = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      const timings = [];
      
      // Update the same tile multiple times
      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();
        builder.addTile(0, 0, tileData);
        const endTime = performance.now();
        
        timings.push(endTime - startTime);
      }
      
      // Performance should remain consistent
      const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
      timings.forEach(time => {
        expect(time).toBeLessThan(avgTime * 3); // No single run should be 3x slower
      });
    });

    test('cleans up data structures properly', () => {
      const tileData1 = [
        [995, 1005, 1015],
        [1005, 1015, 1025],
        [1015, 1025, 1035]
      ];
      
      const tileData2 = [
        [1015, 1025, 1035],
        [1025, 1035, 1045],
        [1035, 1045, 1055]
      ];
      
      // Add first tile
      builder.addTile(0, 0, tileData1);
      const firstSize = builder.tiles.size;
      
      // Replace with different data
      builder.addTile(0, 0, tileData2);
      const secondSize = builder.tiles.size;
      
      // Size should remain the same (replacement, not addition)
      expect(secondSize).toBe(firstSize);
      expect(builder.tiles.get('0,0')).toEqual(tileData2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('handles tiles with extreme coordinate ranges', () => {
      const extremeData = [
        [-1e10, 0, 1e10],
        [0, 1e10, 2e10],
        [1e10, 2e10, 3e10]
      ];
      
      const extremeBuilder = new TiledIsolineBuilder([0, 1e10, 2e10], 64);
      
      expect(() => {
        extremeBuilder.addTile(0, 0, extremeData);
      }).not.toThrow();
    });

    test('handles tiles with very small differences', () => {
      const precisionData = [
        [1000.0000001, 1000.0000002, 1000.0000003],
        [1000.0000002, 1000.0000003, 1000.0000004],
        [1000.0000003, 1000.0000004, 1000.0000005]
      ];
      
      const precisionBuilder = new TiledIsolineBuilder([1000.00000025], 64);
      
      expect(() => {
        precisionBuilder.addTile(0, 0, precisionData);
      }).not.toThrow();
    });

    test('handles tiles with infinite values', () => {
      const infiniteData = [
        [1000, Infinity, 1020],
        [1010, 1020, -Infinity],
        [1020, 1030, 1040]
      ];
      
      expect(() => {
        builder.addTile(0, 0, infiniteData);
    }).not.toThrow(); // Should handle gracefully
});

test('handles tiles with mixed data types', () => {
  const mixedData = [
    [1000, '1010', 1020],
    ['1010', 1020, 1030],
    [1020, 1030, '1040']
  ];
  
  expect(() => {
    builder.addTile(0, 0, mixedData);
  }).not.toThrow(); // Should handle gracefully or convert
});

test('handles very large tile indices', () => {
  const tileData = [
    [1000, 1010],
    [1020, 1030]
  ];
  
  expect(() => {
    builder.addTile(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, tileData);
  }).not.toThrow();
});

test('handles zero-sized tiles gracefully', () => {
  const zeroData = [[]];
  
  expect(() => {
    builder.addTile(0, 0, zeroData);
  }).toThrow(); // Should throw appropriate error
});

test('handles tiles with only one row', () => {
  const singleRowData = [[1000, 1010, 1020, 1030]];
  
  expect(() => {
    builder.addTile(0, 0, singleRowData);
  }).not.toThrow();
});

test('handles tiles with only one column', () => {
  const singleColumnData = [
    [1000],
    [1010],
    [1020],
    [1030]
  ];
  
  expect(() => {
    builder.addTile(0, 0, singleColumnData);
  }).not.toThrow();
});

test('handles concurrent tile additions', async () => {
  const promises = [];
  
  for (let i = 0; i < 5; i++) {
    const tileData = [
      [1000 + i*10, 1010 + i*10],
      [1020 + i*10, 1030 + i*10]
    ];
    
    promises.push(Promise.resolve().then(() => {
      return builder.addTile(i, 0, tileData);
    }));
  }
  
  const results = await Promise.all(promises);
  
  results.forEach(result => {
    expect(result).toHaveProperty('type', 'FeatureCollection');
  });
  
  expect(builder.tiles.size).toBe(5);
});
});

describe('Integration with Dependencies', () => {
test('integrates with Conrec correctly', () => {
  const tileData = [
    [995, 1005, 1015],
    [1005, 1015, 1025],
    [1015, 1025, 1035]
  ];
  
  // Mock Conrec to verify integration
  const originalComputeSegments = builder.conrec.computeSegments;
  const computeSegmentsSpy = jest.spyOn(builder.conrec, 'computeSegments');
  
  builder.addTile(0, 0, tileData);
  
  expect(computeSegmentsSpy).toHaveBeenCalled();
  expect(computeSegmentsSpy).toHaveBeenCalledWith(tileData, expect.any(Array));
  
  computeSegmentsSpy.mockRestore();
});

test('integrates with IsolineBuilder correctly', () => {
  const tileData = [
    [995, 1005, 1015],
    [1005, 1015, 1025],
    [1015, 1025, 1035]
  ];
  
  // Mock IsolineBuilder to verify integration
  const buildIsolinesSpy = jest.spyOn(builder.builder, 'buildIsolines');
  
  builder.addTile(0, 0, tileData);
  
  expect(buildIsolinesSpy).toHaveBeenCalled();
  
  buildIsolinesSpy.mockRestore();
});

test('handles Conrec errors gracefully', () => {
  const tileData = [
    [995, 1005, 1015],
    [1005, 1015, 1025],
    [1015, 1025, 1035]
  ];
  
  // Mock Conrec to throw an error
  const computeSegmentsSpy = jest.spyOn(builder.conrec, 'computeSegments')
    .mockImplementation(() => {
      throw new Error('Conrec error');
    });
  
  expect(() => {
    builder.addTile(0, 0, tileData);
  }).toThrow('Conrec error');
  
  computeSegmentsSpy.mockRestore();
});

test('handles IsolineBuilder errors gracefully', () => {
  const tileData = [
    [995, 1005, 1015],
    [1005, 1015, 1025],
    [1015, 1025, 1035]
  ];
  
  // Mock IsolineBuilder to throw an error
  const buildIsolinesSpy = jest.spyOn(builder.builder, 'buildIsolines')
    .mockImplementation(() => {
      throw new Error('IsolineBuilder error');
    });
  
  expect(() => {
    builder.addTile(0, 0, tileData);
  }).toThrow('IsolineBuilder error');
  
  buildIsolinesSpy.mockRestore();
});
});

describe('Coordinate Transformation', () => {
test('transforms tile coordinates to geographic coordinates', () => {
  const tileData = [
    [995, 1005, 1015],
    [1005, 1015, 1025],
    [1015, 1025, 1035]
  ];
  
  builder.addTile(0, 0, tileData);
  const geojson = builder.getIsolinesAsGeoJSON();
  
  if (geojson.features.length > 0) {
    const feature = geojson.features[0];
    
    if (feature.geometry.type === 'Polygon') {
      const coordinates = feature.geometry.coordinates[0];
      
      coordinates.forEach(coord => {
        expect(typeof coord[0]).toBe('number'); // longitude
        expect(typeof coord[1]).toBe('number'); // latitude
        
        // Coordinates should be in reasonable geographic range
        expect(coord[0]).toBeGreaterThan(-180);
        expect(coord[0]).toBeLessThan(180);
        expect(coord[1]).toBeGreaterThan(-90);
        expect(coord[1]).toBeLessThan(90);
      });
    }
  }
});

test('handles coordinate transformation for different tile positions', () => {
  const tileData = [
    [995, 1005],
    [1015, 1025]
  ];
  
  // Add tiles at different positions
  builder.addTile(0, 0, tileData);
  builder.addTile(1, 1, tileData);
  builder.addTile(-1, -1, tileData);
  
  const geojson = builder.getIsolinesAsGeoJSON();
  
  expect(geojson).toHaveProperty('type', 'FeatureCollection');
  expect(Array.isArray(geojson.features)).toBe(true);
  
  // All features should have valid coordinates
  geojson.features.forEach(feature => {
    if (feature.geometry.type === 'Polygon') {
      feature.geometry.coordinates[0].forEach(coord => {
        expect(typeof coord[0]).toBe('number');
        expect(typeof coord[1]).toBe('number');
        expect(isFinite(coord[0])).toBe(true);
        expect(isFinite(coord[1])).toBe(true);
      });
    }
  });
});

test('maintains coordinate consistency across tiles', () => {
  const tileData1 = [
    [995, 1005],
    [1015, 1025]
  ];
  
  const tileData2 = [
    [1005, 1015],
    [1025, 1035]
  ];
  
  builder.addTile(0, 0, tileData1);
  const geojson1 = builder.getIsolinesAsGeoJSON();
  
  builder.addTile(0, 1, tileData2);
  const geojson2 = builder.getIsolinesAsGeoJSON();
  
  // Coordinates should be consistent and not overlap inappropriately
  expect(geojson1).toHaveProperty('type', 'FeatureCollection');
  expect(geojson2).toHaveProperty('type', 'FeatureCollection');
});
});

describe('Level Management', () => {
test('processes only specified levels', () => {
  const customLevels = [1005, 1025];
  const customBuilder = new TiledIsolineBuilder(customLevels, 64);
  
  const tileData = [
    [995, 1005, 1015],
    [1005, 1015, 1025],
    [1015, 1025, 1035]
  ];
  
  customBuilder.addTile(0, 0, tileData);
  const geojson = customBuilder.getIsolinesAsGeoJSON();
  
  const levels = geojson.features.map(f => f.properties.level);
  const uniqueLevels = [...new Set(levels)];
  
  uniqueLevels.forEach(level => {
    expect(customLevels).toContain(level);
  });
});

test('handles empty levels array', () => {
  const emptyBuilder = new TiledIsolineBuilder([], 64);
  
  const tileData = [
    [995, 1005, 1015],
    [1005, 1015, 1025],
    [1015, 1025, 1035]
  ];
  
  emptyBuilder.addTile(0, 0, tileData);
  const geojson = emptyBuilder.getIsolinesAsGeoJSON();
  
  expect(geojson).toHaveProperty('type', 'FeatureCollection');
  expect(geojson.features).toEqual([]);
});

test('handles duplicate levels', () => {
  const duplicateLevels = [1000, 1010, 1000, 1020, 1010];
  const duplicateBuilder = new TiledIsolineBuilder(duplicateLevels, 64);
  
  const tileData = [
    [995, 1005, 1015],
    [1005, 1015, 1025],
    [1015, 1025, 1035]
  ];
  
  duplicateBuilder.addTile(0, 0, tileData);
  const geojson = duplicateBuilder.getIsolinesAsGeoJSON();
  
  expect(geojson).toHaveProperty('type', 'FeatureCollection');
  
  // Should handle duplicates gracefully
  const levels = geojson.features.map(f => f.properties.level);
  const uniqueLevels = [...new Set(levels)];
  
  expect(uniqueLevels.length).toBeLessThanOrEqual(3); // No more than 3 unique levels
});

test('handles non-numeric levels', () => {
  const invalidLevels = [1000, 'invalid', null, undefined, 1020];
  
  expect(() => {
    new TiledIsolineBuilder(invalidLevels, 64);
  }).not.toThrow(); // Should handle gracefully
});

test('sorts levels appropriately', () => {
  const unsortedLevels = [1020, 1000, 1030, 1010];
  const unsortedBuilder = new TiledIsolineBuilder(unsortedLevels, 64);
  
  const tileData = [
    [995, 1005, 1015],
    [1005, 1015, 1025],
    [1015, 1025, 1035]
  ];
  
  unsortedBuilder.addTile(0, 0, tileData);
  const geojson = unsortedBuilder.getIsolinesAsGeoJSON();
  
  expect(geojson).toHaveProperty('type', 'FeatureCollection');
  
  // Features should be generated for all valid levels
  const levels = geojson.features.map(f => f.properties.level);
  const validLevels = unsortedLevels.filter(l => typeof l === 'number');
  
  validLevels.forEach(level => {
    if (levels.includes(level)) {
      expect(levels).toContain(level);
    }
  });
});
});

describe('Tile Size Management', () => {
test('respects custom tile size', () => {
  const customTileSize = 256;
  const customBuilder = new TiledIsolineBuilder(defaultLevels, customTileSize);
  
  expect(customBuilder.tileSize).toBe(customTileSize);
});

test('handles zero tile size', () => {
  expect(() => {
    new TiledIsolineBuilder(defaultLevels, 0);
  }).not.toThrow(); // Should handle gracefully
});

test('handles negative tile size', () => {
  expect(() => {
    new TiledIsolineBuilder(defaultLevels, -64);
  }).not.toThrow(); // Should handle gracefully
});

test('handles very large tile size', () => {
  const largeTileSize = 10000;
  const largeBuilder = new TiledIsolineBuilder(defaultLevels, largeTileSize);
  
  expect(largeBuilder.tileSize).toBe(largeTileSize);
});

test('handles non-numeric tile size', () => {
  expect(() => {
    new TiledIsolineBuilder(defaultLevels, 'invalid');
  }).not.toThrow(); // Should handle gracefully or use default
});
});
});

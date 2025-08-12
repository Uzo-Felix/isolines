const SpatialIndex = require('./spatialIndex');

class IsolineBuilder {
  constructor(epsilon = 0.0001) {
    this.EPSILON = epsilon;
  }

  /**
   * Build isolines from segments (original method for closed polygons)
   */
  buildIsolines(segments, gridResolution) {
    const segmentsByLevel = this.groupSegmentsByLevel(segments);
    const isolines = [];

    for (const [level, levelSegments] of segmentsByLevel.entries()) {
      const chains = this.buildChains(levelSegments);

      for (const chain of chains) {
        if (chain.length >= 3) {
          // Force closure for polygons
          const closedChain = this.ensureClosedChain(chain);
          closedChain.level = level;
          isolines.push(closedChain);
        }
      }
    }

    return isolines;
  }

  /**
     * Build LineStrings from segments.
     * @param {Array} segments - Input contour segments.
     * @param {number} gridResolution - (Not used, kept for compatibility)
     * @param {object} options - 
     *        forcePolygonClosure: if true, forcibly closes open chains into polygons.
     *        epsilon: coordinate matching tolerance (default: this.EPSILON)
     *        maxForceCloseDistance: max allowed "closing edge" length (default: 10*epsilon)
     *        silent: disable logs
     * @returns {Array} - Array of chain arrays with GeoJSON-style properties.
     */
  buildLineStrings(segments, gridResolution, options = {}) {
    const forcePolygonClosure = !!options.forcePolygonClosure;
    const epsilon = typeof options.epsilon === 'number' ? options.epsilon : this.EPSILON;
    const maxForceCloseDistance = typeof options.maxForceCloseDistance === 'number'
      ? options.maxForceCloseDistance
      : epsilon * 10;
    const silent = !!options.silent;

    const segmentsByLevel = this.groupSegmentsByLevel(segments);
    const lineStrings = [];

    // Remove consecutive duplicate or zero-length points in a chain
    function cleanChain(chain, tol) {
      if (chain.length < 2) return chain;
      const cleaned = [chain[0]];
      for (let i = 1; i < chain.length; i++) {
        const prev = cleaned[cleaned.length - 1];
        const cur = chain[i];
        const dist = Math.sqrt((prev.lat - cur.lat) ** 2 + (prev.lon - cur.lon) ** 2);
        if (dist > tol) {
          cleaned.push(cur);
        }
      }
      return cleaned;
    }

    // Compute Euclidean distance between endpoints
    function endpointDistance(chain) {
      const first = chain[0], last = chain[chain.length - 1];
      return Math.sqrt((first.lat - last.lat) ** 2 + (first.lon - last.lon) ** 2);
    }

    for (const [level, levelSegments] of segmentsByLevel.entries()) {
      const chains = this.buildChains(levelSegments);

      for (const chainRaw of chains) {
        let chain = cleanChain(chainRaw, epsilon);
        if (chain.length < 3) continue; // skip degenerate lines

        // Check closure
        const isClosed = endpointDistance(chain) < epsilon;
        let wasForciblyClosed = false;

        // Only force-closure for long enough chains, and ONLY IF endpoints are not far apart
        if (forcePolygonClosure && chain.length >= 3 && !isClosed) {
          const dist = endpointDistance(chain);
          if (dist < maxForceCloseDistance) {
            chain = [...chain, { lat: chain[0].lat, lon: chain[0].lon }];
            wasForciblyClosed = true;
            if (!silent) console.log(`🔗 Closed LineString (level ${level}) with a forced edge (d=${dist})`);
          } else {
            if (!silent) console.log(`⚠️  Not closing LineString at level ${level}: endpoints d=${dist} exceeds maxForceCloseDistance`);
          }
        }

        const properties = {
          level,
          closure: isClosed ? (wasForciblyClosed ? 'forced_connection' : 'natural_closure') : 'open_linestring',
          wasForciblyClosed,
          isNaturallyClosed: isClosed && !wasForciblyClosed,
          length: chain.length
        };

        chain.properties = properties;

        lineStrings.push(chain);
      }
    }

    //Log summary
    if (forcePolygonClosure && !silent) {
      const total = lineStrings.length;
      const closed = lineStrings.filter(ls => ls.properties.closure !== 'open_linestring').length;
      const forced = lineStrings.filter(ls => ls.properties.closure === 'forced_connection').length;
      const natural = lineStrings.filter(ls => ls.properties.closure === 'natural_closure').length;
      console.log(`📊 LineString Processing Summary: Total: ${total}, Closed: ${closed} (natural: ${natural}, forced: ${forced})`);
    }

    return lineStrings;
  }

  /**
   * Group segments by contour level
   */
  groupSegmentsByLevel(segments) {
    const segmentsByLevel = new Map();

    for (const segment of segments) {
      const level = segment.level;
      if (!segmentsByLevel.has(level)) {
        segmentsByLevel.set(level, []);
      }
      segmentsByLevel.get(level).push(segment);
    }

    return segmentsByLevel;
  }

  /**
   * Build chains of connected segments using spatial indexing
   */
  buildChains(segments) {
    if (segments.length === 0) return [];

    const spatialIndex = new SpatialIndex(1, this.EPSILON);
    spatialIndex.buildIndex(segments);

    const chains = [];
    const usedSegments = new Set();

    for (const segment of segments) {
      if (usedSegments.has(segment)) continue;

      const chain = this.buildChainFromSegment(segment, segments, spatialIndex, usedSegments);
      if (chain.length > 0) {
        chains.push(chain);
      }
    }

    return chains;
  }

  /**
   * Build a chain starting from a specific segment
   */
  buildChainFromSegment(startSegment, allSegments, spatialIndex, usedSegments) {
    if (usedSegments.has(startSegment)) return [];

    const chain = [
      { lat: startSegment.p1.lat, lon: startSegment.p1.lon },
      { lat: startSegment.p2.lat, lon: startSegment.p2.lon }
    ];

    usedSegments.add(startSegment);

    // Try to extend the chain in both directions
    this.extendChain(chain, allSegments, spatialIndex, usedSegments, 'forward');
    this.extendChain(chain, allSegments, spatialIndex, usedSegments, 'backward');

    return chain;
  }

  /**
   * Extend chain in forward or backward direction
   */
  extendChain(chain, allSegments, spatialIndex, usedSegments, direction) {
    let continuousExtension = true;

    while (continuousExtension) {
      continuousExtension = false;

      const searchPoint = direction === 'forward' ?
        chain[chain.length - 1] : chain[0];

      const neighbors = spatialIndex.findNeighbors(searchPoint);

      for (const neighbor of neighbors) {
        if (usedSegments.has(neighbor)) continue;

        const connection = this.findConnection(searchPoint, neighbor);
        if (connection) {
          usedSegments.add(neighbor);

          if (direction === 'forward') {
            chain.push(connection.nextPoint);
          } else {
            chain.unshift(connection.nextPoint);
          }

          continuousExtension = true;
          break;
        }
      }
    }
  }

  /**
   * Find connection between a point and a segment
   */
  findConnection(point, segment) {
    const dist1 = this.distance(point, segment.p1);
    const dist2 = this.distance(point, segment.p2);

    if (dist1 < this.EPSILON) {
      return { nextPoint: { lat: segment.p2.lat, lon: segment.p2.lon } };
    } else if (dist2 < this.EPSILON) {
      return { nextPoint: { lat: segment.p1.lat, lon: segment.p1.lon } };
    }

    return null;
  }

  /**
   * Calculate distance between two points
   */
  distance(p1, p2) {
    const dx = p1.lon - p2.lon;
    const dy = p1.lat - p2.lat;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Ensure chain is closed (for polygon generation)
   */
  ensureClosedChain(chain) {
    if (chain.length < 3) return chain;

    const first = chain[0];
    const last = chain[chain.length - 1];

    // Check if already closed
    if (this.distance(first, last) < this.EPSILON) {
      return chain;
    }

    // Force closure by adding first point to end
    const closedChain = [...chain, { lat: first.lat, lon: first.lon }];
    return closedChain;
  }

  /**
   * NEW: Check if a chain is naturally closed (for LineString analysis)
   */
  isChainClosed(chain) {
    if (chain.length < 3) return false;

    const first = chain[0];
    const last = chain[chain.length - 1];

    return this.distance(first, last) < this.EPSILON;
  }

  /**
   * NEW: Get chain statistics for debugging
   */
  getChainStatistics(chains) {
    const stats = {
      totalChains: chains.length,
      closedChains: 0,
      openChains: 0,
      averageLength: 0,
      minLength: Infinity,
      maxLength: 0,
      lengthDistribution: {}
    };

    let totalLength = 0;

    for (const chain of chains) {
      const length = chain.length;
      totalLength += length;

      if (this.isChainClosed(chain)) {
        stats.closedChains++;
      } else {
        stats.openChains++;
      }

      stats.minLength = Math.min(stats.minLength, length);
      stats.maxLength = Math.max(stats.maxLength, length);

      // Length distribution
      const lengthCategory = Math.floor(length / 10) * 10;
      stats.lengthDistribution[lengthCategory] =
        (stats.lengthDistribution[lengthCategory] || 0) + 1;
    }

    stats.averageLength = totalLength / chains.length || 0;
    if (stats.minLength === Infinity) stats.minLength = 0;

    return stats;
  }

  /**
   * NEW: Validate segments before processing
   */
  validateSegments(segments) {
    const validSegments = [];
    const errors = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      if (!segment.p1 || !segment.p2) {
        errors.push(`Segment ${i}: Missing p1 or p2`);
        continue;
      }

      if (typeof segment.p1.lat !== 'number' || typeof segment.p1.lon !== 'number' ||
        typeof segment.p2.lat !== 'number' || typeof segment.p2.lon !== 'number') {
        errors.push(`Segment ${i}: Invalid coordinates`);
        continue;
      }

      if (isNaN(segment.p1.lat) || isNaN(segment.p1.lon) ||
        isNaN(segment.p2.lat) || isNaN(segment.p2.lon)) {
        errors.push(`Segment ${i}: NaN coordinates`);
        continue;
      }

      if (this.distance(segment.p1, segment.p2) < this.EPSILON * 0.1) {
        errors.push(`Segment ${i}: Zero-length segment`);
        continue;
      }

      validSegments.push(segment);
    }

    if (errors.length > 0) {
      console.warn('Segment validation errors:', errors);
    }

    return {
      valid: validSegments,
      errors: errors,
      validCount: validSegments.length,
      errorCount: errors.length
    };
  }

  /**
   * NEW: Build LineStrings with enhanced validation and statistics
   */
  buildLineStringsWithValidation(segments, gridResolution) {
    console.log(`Building LineStrings from ${segments.length} segments`);

    // Validate segments
    const validation = this.validateSegments(segments);
    console.log(`Validation: ${validation.validCount} valid, ${validation.errorCount} errors`);

    if (validation.validCount === 0) {
      console.warn('No valid segments to process');
      return [];
    }

    // Build LineStrings from valid segments
    const lineStrings = this.buildLineStrings(validation.valid, gridResolution);

    // Get statistics
    const stats = this.getChainStatistics(lineStrings);
    console.log('LineString statistics:', stats);

    return lineStrings;
  }

  /**
   * NEW: Build isolines with enhanced validation and statistics
   */
  buildIsolinesWithValidation(segments, gridResolution) {
    console.log(`Building Isolines from ${segments.length} segments`);

    // Validate segments
    const validation = this.validateSegments(segments);
    console.log(`Validation: ${validation.validCount} valid, ${validation.errorCount} errors`);

    if (validation.validCount === 0) {
      console.warn('No valid segments to process');
      return [];
    }

    // Build isolines from valid segments
    const isolines = this.buildIsolines(validation.valid, gridResolution);

    // Get statistics
    const stats = this.getChainStatistics(isolines);
    console.log('Isoline statistics:', stats);

    return isolines;
  }

  /**
   * Compare LineStrings vs Isolines for the same segments
   */
  compareLineStringsVsIsolines(segments, gridResolution) {
    console.log('Comparing LineStrings vs Isolines approach...');

    const validation = this.validateSegments(segments);

    if (validation.validCount === 0) {
      return {
        lineStrings: [],
        isolines: [],
        comparison: {
          error: 'No valid segments to process'
        }
      };
    }

    const lineStrings = this.buildLineStrings(validation.valid, gridResolution);
    const isolines = this.buildIsolines(validation.valid, gridResolution);

    const lineStringStats = this.getChainStatistics(lineStrings);
    const isolineStats = this.getChainStatistics(isolines);

    const comparison = {
      lineStrings: {
        count: lineStrings.length,
        closed: lineStringStats.closedChains,
        open: lineStringStats.openChains,
        averageLength: lineStringStats.averageLength
      },
      isolines: {
        count: isolines.length,
        closed: isolineStats.closedChains,
        open: isolineStats.openChains,
        averageLength: isolineStats.averageLength
      },
      difference: {
        countDiff: isolines.length - lineStrings.length,
        closedDiff: isolineStats.closedChains - lineStringStats.closedChains,
        openDiff: isolineStats.openChains - lineStringStats.openChains
      }
    };

    console.log('Comparison results:', comparison);

    return {
      lineStrings,
      isolines,
      comparison
    };
  }
}

module.exports = IsolineBuilder;

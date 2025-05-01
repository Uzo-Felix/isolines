class IsolineBuilder {
    constructor() {
      this.EPSILON = 0.000001;
    }
  
    buildIsolines(segments, gridResolution = 1) {
      const isolines = [];
      const unused = new Set(segments);
      const index = new Map();
      
      // Build a spatial index for quick neighbor lookup
      for (const segment of segments) {
        const key1 = this.hashPoint(segment.p1);
        const key2 = this.hashPoint(segment.p2);
        if (!index.has(key1)) index.set(key1, []);
        if (!index.has(key2)) index.set(key2, []);
        index.get(key1).push(segment);
        index.get(key2).push(segment);
      }
      
      while (unused.size > 0) {
        const start = Array.from(unused)[0];
        unused.delete(start);
        const poly = [start.p1, start.p2];
        // Store the level value from the segment
        poly.level = start.level;
        
        let current = start.p2;
        
        let iterations = 0;
        const MAX_ITERATIONS = segments.length * 2; // Safety limit
        
        while (!this.isClosed(poly) && iterations < MAX_ITERATIONS) {
          iterations++;
          
          const neighbors = index.get(this.hashPoint(current)) || [];
          const candidates = neighbors.filter(seg => 
            unused.has(seg) && 
            (this.pointsEqual(seg.p1, current) || this.pointsEqual(seg.p2, current))
          );
          
          if (candidates.length === 0) break;
          
          // Apply heuristic: choose segment with farthest endpoint from previous point
          let nextSegment = null;
          let maxDistance = -Infinity;
          
          for (const seg of candidates) {
            const endpoint = this.pointsEqual(seg.p1, current) ? seg.p2 : seg.p1;
            const prevPoint = poly[poly.length - 2] || current; // Fallback to current
            const dist = this.distance(prevPoint, endpoint);
            
            if (dist > maxDistance) {
              maxDistance = dist;
              nextSegment = seg;
            }
          }
          
          if (!nextSegment) break;
          
          unused.delete(nextSegment);
          const nextPoint = this.pointsEqual(nextSegment.p1, current) ? 
            nextSegment.p2 : nextSegment.p1;
          
          poly.push(nextPoint);
          current = nextPoint;
        }
        
        isolines.push(poly);
      }
      
      // Apply the ISOLINE-GLUE-U algorithm to merge unclosed isolines
      return this.mergeUnclosedIsolines(isolines, gridResolution);
    }
    
    mergeUnclosedIsolines(isolines, gridResolution) {
      const closed = [];
      const unclosed = [];
      const μ = Math.sqrt(2) * gridResolution * 1.5; // Slightly larger threshold for better merging
      
      // Separate closed and unclosed isolines
      isolines.forEach(poly => {
        if (this.isClosed(poly)) {
          closed.push(poly);
        } else {
          unclosed.push(poly);
        }
      });
      
      let mergeIterations = 0;
      const MAX_MERGE_ITERATIONS = unclosed.length * 2; // Safety limit
      
      while (unclosed.length > 0 && mergeIterations < MAX_MERGE_ITERATIONS) {
        mergeIterations++;
        
        const current = unclosed.pop();
        let bestMatch = null;
        let bestIndex = -1;
        
        // Find closest unclosed isoline within μ distance
        for (let i = 0; i < unclosed.length; i++) {
          const target = unclosed[i];
          
          // Check if current's end connects to target's start
          const dEndToStart = this.distance(current[current.length - 1], target[0]);
          
          // Check if current's start connects to target's end
          const dStartToEnd = this.distance(current[0], target[target.length - 1]);
          
          if (dEndToStart < μ || dStartToEnd < μ) {
            const minDist = Math.min(dEndToStart, dStartToEnd);
            const isStartToEnd = dStartToEnd < dEndToStart;
            
            if (!bestMatch || minDist < bestMatch.distance) {
              bestMatch = { 
                poly: target, 
                distance: minDist,
                startToEnd: isStartToEnd
              };
              bestIndex = i;
            }
          }
        }
        
        // Merge if match found
        if (bestMatch && bestIndex >= 0) {
          let merged;
          
          if (bestMatch.startToEnd) {
            // current's start connects to target's end
            // Reverse current and append target
            merged = [...current.slice().reverse(), ...bestMatch.poly];
          } else {
            // current's end connects to target's start
            merged = [...current, ...bestMatch.poly];
          }
          
          // Preserve the level value
          merged.level = current.level;
          
          unclosed.splice(bestIndex, 1);
          
          // Check if the merged polyline forms a closed loop
          if (this.isClosed(merged)) {
            closed.push(merged);
          } else {
            unclosed.push(merged);
          }
        } else {
          // No match found, treat as a separate isoline
          closed.push(current);
        }
      }
      
      // Handle any remaining unclosed isolines
      closed.push(...unclosed);
      
      return closed;
    }
    
    isClosed(poly) {
      return poly.length > 2 && 
             this.pointsEqual(poly[0], poly[poly.length - 1]);
    }
    
    pointsEqual(p1, p2) {
      return Math.abs(p1.lat - p2.lat) < this.EPSILON && 
             Math.abs(p1.lon - p2.lon) < this.EPSILON;
    }
    
    hashPoint(point) {
      return `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
    }
    
    distance(p1, p2) {
      const dx = p1.lon - p2.lon;
      const dy = p1.lat - p2.lat;
      return Math.sqrt(dx * dx + dy * dy);
    }
  }
  
  module.exports = IsolineBuilder;
  
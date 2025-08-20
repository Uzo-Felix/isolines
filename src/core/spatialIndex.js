class SpatialIndex {
    constructor(gridSize = 10, epsilon = 0.0001) {
      this.EPSILON = epsilon;
      this.rTree = new Map();
      this.gridSize = gridSize;
    }
  
    buildIndex(segments) {
      for (const segment of segments) {
        const bbox = this.boundingBox(segment);
        
        const minGridX = Math.floor(bbox.minLon / this.gridSize);
        const maxGridX = Math.floor(bbox.maxLon / this.gridSize);
        const minGridY = Math.floor(bbox.minLat / this.gridSize);
        const maxGridY = Math.floor(bbox.maxLat / this.gridSize);
        
        for (let x = minGridX; x <= maxGridX; x++) {
          for (let y = minGridY; y <= maxGridY; y++) {
            const key = `${x},${y}`;
            if (!this.rTree.has(key)) {
              this.rTree.set(key, []);
            }
            this.rTree.get(key).push(segment);
          }
        }
      }
    }
  
    findNeighbors(point) {
      const gridX = Math.floor(point.lon / this.gridSize);
      const gridY = Math.floor(point.lat / this.gridSize);
      
      const neighbors = [];
      const visited = new Set();
      
      // Check the 3x3 grid centered on the point
      for (let x = gridX - 1; x <= gridX + 1; x++) {
        for (let y = gridY - 1; y <= gridY + 1; y++) {
          const key = `${x},${y}`;
          const segments = this.rTree.get(key) || [];
          
          for (const segment of segments) {
            // Check if the segment is near the point, not just the endpoints
            if (!visited.has(segment) && this.distanceToSegment(segment, point) < this.EPSILON) {
              neighbors.push(segment);
              visited.add(segment);
            }
          }
        }
      }
      
      return neighbors;
    }
  
    /**
     * Calculates the shortest distance from a point to a line segment.
     * This is a more robust check than just using the endpoints.
     */
    distanceToSegment(segment, point) {
      const p1 = segment.p1;
      const p2 = segment.p2;
      const dx = p2.lon - p1.lon;
      const dy = p2.lat - p1.lat;
      
      if (dx === 0 && dy === 0) {
        // Segment is a single point
        return this.distance(p1, point);
      }
      
      // Calculate the parameter t of the projection of the point onto the line
      const t = ((point.lon - p1.lon) * dx + (point.lat - p1.lat) * dy) / (dx * dx + dy * dy);
      
      let closestPoint;
      if (t < 0) {
        // Closest point is the start of the segment
        closestPoint = p1;
      } else if (t > 1) {
        // Closest point is the end of the segment
        closestPoint = p2;
      } else {
        // Closest point is on the segment
        closestPoint = {
          lon: p1.lon + t * dx,
          lat: p1.lat + t * dy
        };
      }
      
      return this.distance(closestPoint, point);
    }
  
    distance(p1, p2) {
      const dx = p1.lon - p2.lon;
      const dy = p1.lat - p2.lat;
      return Math.sqrt(dx * dx + dy * dy);
    }
  
    boundingBox(segment) {
      return {
        minLon: Math.min(segment.p1.lon, segment.p2.lon),
        minLat: Math.min(segment.p1.lat, segment.p2.lat),
        maxLon: Math.max(segment.p1.lon, segment.p2.lon),
        maxLat: Math.max(segment.p1.lat, segment.p2.lat)
      };
    }
  }
  
  module.exports = SpatialIndex;
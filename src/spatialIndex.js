class SpatialIndex {
    constructor(gridSize = 10) {
      this.EPSILON = 0.01;
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
      
      for (let x = gridX - 1; x <= gridX + 1; x++) {
        for (let y = gridY - 1; y <= gridY + 1; y++) {
          const key = `${x},${y}`;
          const segments = this.rTree.get(key) || [];
          
          for (const segment of segments) {
            if (!visited.has(segment) && this.isNearPoint(segment, point)) {
              neighbors.push(segment);
              visited.add(segment);
            }
          }
        }
      }
      
      return neighbors;
    }
  
    isNearPoint(segment, point) {
      return this.distance(segment.p1, point) < this.EPSILON || 
             this.distance(segment.p2, point) < this.EPSILON;
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
  
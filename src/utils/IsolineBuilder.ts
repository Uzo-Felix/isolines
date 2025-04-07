import { Segment, Point } from './conrec';

type Polygon = Point[];

export class IsolineBuilder {
    private static readonly EPSILON = 0.000001;

    buildIsolines(segments: Segment[]): Polygon[] {
        const isolines: Polygon[] = [];
        const unused = new Set(segments);
        const index = new Map<string, Segment[]>();
        
        // Build a spatial index for quick neighbor lookup
        for (const segment of segments) {
            const key1 = this.hashPoint(segment.p1);
            const key2 = this.hashPoint(segment.p2);
            if (!index.has(key1)) index.set(key1, []);
            if (!index.has(key2)) index.set(key2, []);
            index.get(key1)!.push(segment);
            index.get(key2)!.push(segment);
        }
        
        while (unused.size > 0) {
            const start = Array.from(unused)[0];
            unused.delete(start);
            const poly: Polygon = [start.p1, start.p2];
            let current = start.p2;
            
            let iterations = 0;
            const MAX_ITERATIONS = segments.length * 2; // Safety limit
            
            while (!this.isClosed(poly) && iterations < MAX_ITERATIONS) {
                iterations++;
                
                const neighbors = index.get(this.hashPoint(current)) || [];
                const nextSegment = neighbors.find(seg => 
                    unused.has(seg) && 
                    (this.pointsEqual(seg.p1, current) || this.pointsEqual(seg.p2, current))
                );
                
                if (!nextSegment) break;
                
                unused.delete(nextSegment);
                const nextPoint = this.pointsEqual(nextSegment.p1, current) ? 
                    nextSegment.p2 : nextSegment.p1;
                
                poly.push(nextPoint);
                current = nextPoint;
            }
            
            isolines.push(poly);
        }
        
        return isolines;
    }    
    private isClosed(poly: Polygon): boolean {
        return poly.length > 2 && 
               this.pointsEqual(poly[0], poly[poly.length - 1]);
    }
    
    private pointsEqual(p1: Point, p2: Point): boolean {
        return Math.abs(p1.lat - p2.lat) < IsolineBuilder.EPSILON && 
               Math.abs(p1.lon - p2.lon) < IsolineBuilder.EPSILON;
    }
    
    private hashPoint(point: Point): string {
        return `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
    }
}

export type { Polygon };

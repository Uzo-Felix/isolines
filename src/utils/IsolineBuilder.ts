import { Segment, Point } from './conrec';

type Polygon = Point[];

export class IsolineBuilder {
    private static readonly EPSILON = 0.000001;

    buildIsolines(segments: Segment[], gridResolution: number = 1): Polygon[] {
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
                const candidates = neighbors.filter(seg => 
                    unused.has(seg) && 
                    (this.pointsEqual(seg.p1, current) || this.pointsEqual(seg.p2, current))
                );
                
                if (candidates.length === 0) break;
                
                // Apply heuristic: choose segment with farthest endpoint from previous point
                let nextSegment: Segment | null = null;
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
    private mergeUnclosedIsolines(isolines: Polygon[], gridResolution: number): Polygon[] {
        const closed: Polygon[] = [];
        const unclosed: Polygon[] = [];
        const μ = Math.sqrt(2) * gridResolution * 1.5; // Slightly larger threshold for better merging
        
        // Separate closed and unclosed isolines
        isolines.forEach(poly => {
            this.isClosed(poly) ? closed.push(poly) : unclosed.push(poly);
        });
        
        console.log(`Initial isolines: ${isolines.length} (${closed.length} closed, ${unclosed.length} unclosed)`);
        
        let mergeIterations = 0;
        const MAX_MERGE_ITERATIONS = unclosed.length * 2; // Safety limit
        
        while (unclosed.length > 0 && mergeIterations < MAX_MERGE_ITERATIONS) {
            mergeIterations++;
            
            const current = unclosed.pop()!;
            let bestMatch: { poly: Polygon, distance: number, startToEnd: boolean } | null = null;
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
                let merged: Polygon;
                
                if (bestMatch.startToEnd) {
                    // current's start connects to target's end
                    // Reverse current and append target
                    merged = [...current.slice().reverse(), ...bestMatch.poly];
                } else {
                    // current's end connects to target's start
                    merged = [...current, ...bestMatch.poly];
                }
                
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
        
        console.log(`Final isolines after merging: ${closed.length}`);
        return closed;
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
    
    private distance(p1: Point, p2: Point): number {
        const dx = p1.lon - p2.lon;
        const dy = p1.lat - p2.lat;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

export type { Polygon };

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Polygon } from '../utils/IsolineBuilder';

interface Point {
    lat: number;
    lon: number;
}

interface Segment {
    p1: Point;
    p2: Point;
}

interface IsolineChartProps {
    segments: Segment[];
    isolines?: Polygon[];
    width: number;
    height: number;
    contourColor?: string;
    showSegments?: boolean;
}

const IsoLineChart: React.FC<IsolineChartProps> = ({ 
    segments, 
    isolines = [],
    width, 
    height, 
    contourColor = 'steelblue',
    showSegments = false
}) => {
    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        if (!svgRef.current || (segments.length === 0 && isolines.length === 0)) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        // Find the data bounds from segments and isolines
        const allPoints: Point[] = [
            ...segments.flatMap(s => [s.p1, s.p2]),
            ...isolines.flat()
        ];
        
        const latExtent = d3.extent(
            allPoints.map(p => p.lat)
        ) as [number, number];
        
        const lonExtent = d3.extent(
            allPoints.map(p => p.lon)
        ) as [number, number];

        // Add padding to the bounds
        const padding = 0.05;
        const latRange = latExtent[1] - latExtent[0];
        const lonRange = lonExtent[1] - lonExtent[0];
        
        const latPadding = latRange * padding;
        const lonPadding = lonRange * padding;

        // Create scales with padding
        const xScale = d3.scaleLinear()
            .domain([lonExtent[0] - lonPadding, lonExtent[1] + lonPadding])
            .range([0, width]);

        const yScale = d3.scaleLinear()
            .domain([latExtent[0] - latPadding, latExtent[1] + latPadding])
            .range([height, 0]);

        const container = svg.append('g')
            .attr('class', 'visualization-container');

        if (showSegments) {
            container.append('g')
                .attr('class', 'segments')
                .selectAll('line')
                .data(segments)
                .enter()
                .append('line')
                .attr('x1', d => xScale(d.p1.lon))
                .attr('y1', d => yScale(d.p1.lat))
                .attr('x2', d => xScale(d.p2.lon))
                .attr('y2', d => yScale(d.p2.lat))
                .attr('stroke', 'rgba(70, 130, 180, 0.4)')  // Light steelblue
                .attr('stroke-width', 0.5);
        }

        const lineGenerator = d3.line<Point>()
            .x(d => xScale(d.lon))
            .y(d => yScale(d.lat))
            .curve(d3.curveLinear);

        container.append('g')
            .attr('class', 'isolines')
            .selectAll('path')
            .data(isolines)
            .enter()
            .append('path')
            .attr('d', lineGenerator)
            .attr('fill', 'none')
            .attr('stroke', contourColor)
            .attr('stroke-width', 1.5)
            .attr('stroke-linejoin', 'round')
            .attr('stroke-linecap', 'round');

        svg.append('rect')
            .attr('width', width)
            .attr('height', height)
            .attr('fill', 'none')
            .attr('stroke', '#ccc')
            .attr('stroke-width', 1);

    }, [segments, isolines, width, height, contourColor, showSegments]);

    return (
        <div className="chart-container">
            <svg ref={svgRef} width={width} height={height} />
            {segments.length === 0 && isolines.length === 0 && (
                <div className="no-data-message">
                    No data to display
                </div>
            )}
        </div>
    );
};

export default IsoLineChart;

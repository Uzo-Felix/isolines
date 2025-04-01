import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

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
    width: number;
    height: number;
    contourColor?: string;
}

const IsoLineChart: React.FC<IsolineChartProps> = ({ 
    segments, 
    width, 
    height, 
    contourColor = 'steelblue' 
}) => {
    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        if (!svgRef.current || segments.length === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove(); 

        const latExtent = d3.extent(
            segments.flatMap(s => [s.p1.lat, s.p2.lat])
        ) as [number, number];
        
        const lonExtent = d3.extent(
            segments.flatMap(s => [s.p1.lon, s.p2.lon])
        ) as [number, number];

        const padding = 0.05;
        const latRange = latExtent[1] - latExtent[0];
        const lonRange = lonExtent[1] - lonExtent[0];
        
        const latPadding = latRange * padding;
        const lonPadding = lonRange * padding;

        const xScale = d3.scaleLinear()
            .domain([lonExtent[0] - lonPadding, lonExtent[1] + lonPadding])
            .range([0, width]);

        const yScale = d3.scaleLinear()
            .domain([latExtent[0] - latPadding, latExtent[1] + latPadding])
            .range([height, 0]); 

        const isolineGroup = svg.append('g')
            .attr('class', 'isolines');

        isolineGroup.selectAll('line')
            .data(segments)
            .enter()
            .append('line')
            .attr('x1', d => xScale(d.p1.lon))
            .attr('y1', d => yScale(d.p1.lat))
            .attr('x2', d => xScale(d.p2.lon))
            .attr('y2', d => yScale(d.p2.lat))
            .attr('stroke', contourColor)
            .attr('stroke-width', 1.5)
            .attr('opacity', 0.8);

        svg.append('rect')
            .attr('width', width)
            .attr('height', height)
            .attr('fill', 'none')
            .attr('stroke', '#ccc')
            .attr('stroke-width', 1);

    }, [segments, width, height, contourColor]);

    return (
        <div className="chart-container">
            <svg ref={svgRef} width={width} height={height} />
            {segments.length === 0 && (
                <div className="no-data-message">
                    No segments to display
                </div>
            )}
        </div>
    );
};

export default IsoLineChart;

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface IsolineChartProps {
    data: Array<{ x: number; y: number; value: number }>;
    width: number;
    height: number;
    contourColor?: string;
}

const IsoLineChart: React.FC<IsolineChartProps> = ({ data, width, height, contourColor = 'steelblue' }) => {
    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        if (!svgRef.current) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove(); // Clear previous content

        const xScale = d3.scaleLinear()
            .domain(d3.extent(data, d => d.x) as [number, number])
            .range([0, width]);

        const yScale = d3.scaleLinear()
            .domain(d3.extent(data, d => d.y) as [number, number])
            .range([height, 0]);

        const contours = d3.contourDensity<{ x: number; y: number; value: number }>()
            .x(d => d.x)
            .y(d => d.y)
            .size([width, height])
            .bandwidth(20)
            .thresholds(10)(data);

        svg.selectAll('path')
            .data(contours)
            .enter()
            .append('path')
            .attr('d', d3.geoPath())
            .attr('fill', contourColor)
            .attr('stroke', 'white')
            .attr('stroke-width', 0.5);
    }, [data, width, height, contourColor]);

    return <svg ref={svgRef} width={width} height={height} />;
};

export default IsoLineChart;
import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

type Point = { x: number; y: number };
type Segment = { start: Point; end: Point };
type IsolineChartProps = { isolines: Segment[][] };

const IsolineChart: React.FC<IsolineChartProps> = ({ isolines }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 600;
    const height = 400;
    const xScale = d3.scaleLinear().domain([0, 10]).range([50, width - 50]); 
    const yScale = d3.scaleLinear().domain([0, 10]).range([height - 50, 50]); 

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .style("background", "#f8f9fa")
      .style("border", "1px solid #ddd");

    // Remove previous isolines before drawing new ones
    svg.selectAll("*").remove();

    // Define line generator
    const lineGenerator = d3.line<Point>()
      .x(d => xScale(d.x))
      .y(d => yScale(d.y));

    // Draw isolines
    isolines.forEach((segments, index) => {
      svg.append("path")
        .datum(segments.flatMap(seg => [seg.start, seg.end])) // Convert to point list
        .attr("d", lineGenerator)
        .attr("stroke", d3.schemeCategory10[index % 10]) // Assign colors
        .attr("stroke-width", 2)
        .attr("fill", "none");
    });

  }, [isolines]);

  return <svg ref={svgRef}></svg>;
};

export default IsolineChart;

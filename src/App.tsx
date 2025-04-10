import React, { useState, useEffect } from 'react';
import './App.css';
import IsoLineChart from './components/IsoLineChart';
import Papa from 'papaparse';
import * as d3 from 'd3';
import { Conrec, Segment } from './utils/conrec';
import { IsolineBuilder, Polygon } from './utils/IsolineBuilder';
import { SpatialIndex } from './utils/SpatialIndex';

const App: React.FC = () => {
    const [segments, setSegments] = useState<Segment[]>([]);
    const [isolines, setIsolines] = useState<Polygon[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [showRawSegments, setShowRawSegments] = useState<boolean>(false);

    useEffect(() => {
        setIsLoading(true);

        fetch('/data/msl.csv')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch CSV file: ${response.status} ${response.statusText}`);
                }
                return response.text();
            })
            .then(csvText => {
                // Try to clean and preprocess the CSV text
                const cleanedText = csvText
                    .replace(/\r\n/g, '\n')  // Normalize line endings
                    .trim();                 // Remove extra whitespace

                // Try to detect the delimiter by examining the first few lines
                const lines = cleanedText.split('\n').slice(0, 5);
                let delimiter = ','; // Default

                // Check for common delimiters
                const possibleDelimiters = [',', ';', '\t', '|', ' '];
                for (const del of possibleDelimiters) {
                    // If all lines have the same number of fields with this delimiter, it's likely correct
                    const counts = lines.map(line => line.split(del).length);
                    if (counts.every(c => c === counts[0]) && counts[0] > 1) {
                        delimiter = del;
                        console.log(`Detected delimiter: "${delimiter === '\t' ? 'tab' : delimiter}"`);
                        break;
                    }
                }

                // Now parse with the detected delimiter
                Papa.parse(cleanedText, {
                    delimiter: delimiter,
                    header: false,
                    skipEmptyLines: true,
                    dynamicTyping: true,
                    complete: (result) => {
                        try {
                            if (result.errors && result.errors.length > 0) {
                                setError(`CSV parsing error: ${result.errors[0].message}`);
                                setIsLoading(false);
                                return;
                            }

                            // Process the data
                            let rawData = result.data as any[][];

                            // Check if the first row might be headers
                            const firstRow = rawData[0];
                            const isFirstRowHeader = firstRow &&
                                firstRow.some(val => typeof val === 'string' && isNaN(Number(val)));

                            if (isFirstRowHeader) {
                                console.log("First row appears to be headers, skipping it");
                                rawData = rawData.slice(1);
                            }

                            // Try to convert string values to numbers
                            const convertedData = rawData.map(row =>
                                row.map(val => {
                                    if (typeof val === 'number') return val;
                                    if (typeof val === 'string') {
                                        // Try to convert string
                                        // Try to convert string to number
                                        const num = Number(val.replace(/,/g, '.'));
                                        return isNaN(num) ? NaN : num;
                                    }
                                    return NaN;
                                })
                            );

                            // Filter out any non-numeric rows/values
                            const numericData = convertedData
                                .filter(row => row.length > 0 && row.some(val => !isNaN(val)))
                                .map(row => row.map(val => isNaN(val) ? 0 : val)); // Replace NaN with 0

                            if (numericData.length === 0 || numericData[0].length === 0) {
                                setError('No valid numeric data found in CSV');
                                setIsLoading(false);
                                return;
                            }

                            // Flatten the array to find min/max values
                            const flatData = numericData.flat().filter(val => !isNaN(val));
                            const min = d3.min(flatData) || 0;
                            const max = d3.max(flatData) || 100;

                            // Create contour levels
                            const range = max - min;
                            const step = range / 10; // 10 contour levels
                            const levels = d3.range(min + step, max, step); // Skip the minimum level

                            console.log("Data dimensions:", numericData.length, "×", numericData[0].length);
                            console.log("Value range:", min, "to", max);
                            console.log("Contour levels:", levels);

                            // Generate contour segments
                            const conrec = new Conrec();
                            const computedSegments = conrec.computeSegments(numericData, levels);

                            console.log('Generated segments:', computedSegments.length);

                            // Build isolines from segments
                            const builder = new IsolineBuilder();
                            const computedIsolines = builder.buildIsolines(computedSegments);

                            console.log('Generated isolines:', computedIsolines.length);

                            setSegments(computedSegments);
                            setIsolines(computedIsolines);
                            setIsLoading(false);
                        } catch (err) {
                            console.error('Error processing data:', err);
                            setError(`Error processing data: ${err instanceof Error ? err.message : String(err)}`);
                            setIsLoading(false);
                        }
                    },
                    error: (error: any) => {
                        console.error('CSV parsing error:', error);
                        setError(`Failed to parse CSV: ${error}`);
                        setIsLoading(false);
                    }
                });
            })
            .catch(err => {
                console.error('Error fetching CSV:', err);
                setError(`Failed to load CSV: ${err.message}`);
                setIsLoading(false);
            });
    }, []);

    const config = {
        width: window.innerWidth * 0.8,
        height: window.innerHeight * 0.8,
    };

    const toggleRawSegments = () => {
        setShowRawSegments(!showRawSegments);
    };

    return (
        <div className="App">
            <h1>Isoline Visualization</h1>

            {error ? (
                <div className="error-message">
                    <p>Error: {error}</p>
                    <p>Make sure your CSV file is properly formatted and located at /public/data/msl.csv</p>
                </div>
            ) : isLoading ? (
                <p>Loading data...</p>
            ) : (
                <>
                    <div className="controls">
                        <button onClick={toggleRawSegments}>
                            {showRawSegments ? "Hide Raw Segments" : "Show Raw Segments"}
                        </button>
                        <div className="stats">
                            <p>Segments: {segments.length} | Isolines: {isolines.length}</p>
                        </div>
                    </div>

                    <IsoLineChart
                        segments={segments}
                        isolines={isolines}
                        width={config.width}
                        height={config.height}
                        contourColor="steelblue"
                        showSegments={showRawSegments}
                    />
                </>
            )}
        </div>
    );
};

export default App;

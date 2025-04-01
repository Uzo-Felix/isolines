import React, { useState, useEffect } from 'react';
import './App.css';
import IsoLineChart from './components/IsoLineChart';
import Papa from 'papaparse';
import * as d3 from 'd3';
import { Conrec } from './utils/conrec';

interface Point {
    lat: number;
    lon: number;
}

interface Segment {
    p1: Point;
    p2: Point;
}

const App: React.FC = () => {
    const [segments, setSegments] = useState<Segment[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [csvContent, setCsvContent] = useState<string | null>(null);

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
                setCsvContent(csvText.substring(0, 500)); // Store a sample for debugging
                
                const cleanedText = csvText
                    .replace(/\r\n/g, '\n') 
                    .trim();         
                
                console.log("CSV first 200 characters:", cleanedText.substring(0, 200));
                
                const lines = cleanedText.split('\n').slice(0, 5);
                let delimiter = ','; 
                
                const possibleDelimiters = [',', ';', '\t', '|', ' '];
                for (const del of possibleDelimiters) {
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
                            
                            let rawData = result.data as any[][];
                            
                            console.log("Raw data sample (first 3 rows):", 
                                rawData.slice(0, 3).map(row => JSON.stringify(row)));
                            
                            const firstRow = rawData[0];
                            const isFirstRowHeader = firstRow && 
                                firstRow.some(val => typeof val === 'string' && isNaN(Number(val)));
                            
                            if (isFirstRowHeader) {
                                console.log("First row appears to be headers, skipping it");
                                rawData = rawData.slice(1);
                            }
                            
                            const convertedData = rawData.map(row => 
                                row.map(val => {
                                    if (typeof val === 'number') return val;
                                    if (typeof val === 'string') {
                                        const num = Number(val.replace(/,/g, '.'));
                                        return isNaN(num) ? NaN : num;
                                    }
                                    return NaN;
                                })
                            );
                            
                            const numericData = convertedData
                                .filter(row => row.length > 0 && row.some(val => !isNaN(val)))
                                .map(row => row.map(val => isNaN(val) ? 0 : val)); // Replace NaN with 0
                            
                            if (numericData.length === 0 || numericData[0].length === 0) {
                                setError('No valid numeric data found in CSV');
                                setIsLoading(false);
                                return;
                            }
                            
                            const flatData = numericData.flat().filter(val => !isNaN(val));
                            const min = d3.min(flatData) || 0;
                            const max = d3.max(flatData) || 100;
                            
                            // Create contour levels
                            const range = max - min;
                            const step = range / 10;
                            const levels = d3.range(min + step, max, step);
                            
                            console.log("Data dimensions:", numericData.length, "×", numericData[0].length);
                            console.log("Value range:", min, "to", max);
                            console.log("Contour levels:", levels);
                            
                            const conrec = new Conrec();
                            const computedSegments = conrec.computeSegments(numericData, levels);
                            
                            console.log('Generated segments:', computedSegments.length);
                            setSegments(computedSegments);
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

    return (
        <div className="App">
            <h1>Isoline Visualization</h1>
            {error ? (
                <div className="error-message">
                    <p>Error: {error}</p>
                    <p>Make sure your CSV file is properly formatted and located at /public/data/msl.csv</p>
                    {csvContent && (
                        <div>
                            <p>CSV content sample:</p>
                            <pre style={{ 
                                maxHeight: '200px', 
                                overflow: 'auto', 
                                border: '1px solid #ccc', 
                                padding: '10px',
                                fontSize: '12px',
                                backgroundColor: '#f5f5f5'
                            }}>
                                {csvContent}
                            </pre>
                        </div>
                    )}
                </div>
            ) : isLoading ? (
                <p>Loading data...</p>
            ) : segments.length > 0 ? (
                <IsoLineChart 
                    segments={segments} 
                    width={config.width} 
                    height={config.height} 
                    contourColor="steelblue"
                />
            ) : (
                <p>No contour segments generated. Check your data format.</p>
            )}
        </div>
    );
};

export default App;

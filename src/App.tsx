import React, { useState, useEffect } from 'react';
import './App.css';
import IsoLineChart from './components/IsoLineChart';
import * as d3 from 'd3';
import Papa from 'papaparse';

const App: React.FC = () => {
    const [transformedData, setTransformedData] = useState<Array<{ x: number; y: number; value: number }>>([]);

    useEffect(() => {
        // Load and parse the CSV file
        Papa.parse('./data/msl.csv', {
            download: true,
            header: false, // Assuming the CSV doesn't have headers
            complete: (result) => {
                const rawData = result.data as number[][]; // Assuming the CSV is a grid of numbers
                const gridSize = rawData[0].length; // Number of columns in the CSV

                // Transform the data into x, y, value format
                const data = rawData.flatMap((row, rowIndex) =>
                    row.map((value, colIndex) => ({
                        x: colIndex,
                        y: rowIndex,
                        value: parseFloat(value as unknown as string),
                    }))
                );

                setTransformedData(data);
            },
        });
    }, []);

    const config = {
        width: window.innerWidth * 0.8, // 80% of the screen width
    height: window.innerHeight * 0.8, // 80% of the screen height
        colorScale: d3.scaleSequential(d3.interpolateBlues),
    };

    return (
        <div className="App">
            <h1>Isoline Visualization</h1>
            {transformedData.length > 0 ? (
                <IsoLineChart data={transformedData} width={config.width} height={config.height} />
            ) : (
                <p>Loading data...</p>
            )}
        </div>
    );
};

export default App;
# Isolines Visualization with Javascript

A JavaScript tool for efficient construction and visualization of isolines (contour lines) from gridded georeferenced data, based on the research paper "EFFICIENT ISOLINES CONSTRUCTION METHOD FOR VISUALIZATION OF GRIDDED GEOREFERENCED DATA" by R.A. Rodriges Zalipynis.

## Overview

Isolines-JS implements a three-stage method for efficient isoline construction:

1. **Segment Generation**: Uses a CONREC algorithm implementation to generate contour segments from grid cells
2. **Spatial Indexing**: Employs spatial indexing to accelerate neighbor segment search
3. **Polygon Construction**: Connects segments into closed polygons for efficient visualization and GIS operations

The tool is designed for on-the-fly isoline construction from large gridded datasets, making it suitable for interactive web applications and integration with tile-based services like WMTS.

## Features

- Generate isolines from 1D arrays or 2D grids of values
- Convert isolines to GeoJSON format for easy visualization
- Interactive web visualization with CSV data import
- Efficient processing of large datasets with downsampling
- Customizable contour levels
- Handles coordinate system peculiarities and data gaps
- Ensures closed polygons for GIS operations
- **Tile-based processing** for integration with WMTS and other tile services
- Incremental isoline construction as tiles arrive

## Usage

```bash
git clone https://github.com/Uzo-Felix/isolines.git
cd isolines
```

## API

### Core Functions

#### `generateIsolinesFromValues(values, options)`

Generates isolines from a 1D array of values.

- `values`: Array of numeric values
- `options`: (Optional) Configuration object
  - `width`: Width of the grid (optional, defaults to square grid)
  - `height`: Height of the grid (optional)
  - `tileSize`: Size of tiles for large datasets (optional, default 128)
  - `forceTiled`: Force using tiled processing even for small datasets
  - `levels`: Custom contour levels (optional)

Returns a GeoJSON FeatureCollection.

#### `generateIsolines(grid, levels)`

Generates isolines from a 2D grid of values.

- `grid`: 2D array of numeric values
- `levels`: Array of contour levels to generate

Returns a GeoJSON FeatureCollection.

### Core Classes

- `Conrec`: Implements the CONREC algorithm for generating contour segments from grid cells
- `IsolineBuilder`: Builds continuous isolines from contour segments and ensures polygons are closed
- `SpatialIndex`: Provides spatial indexing for efficient neighbor segment lookup
- `TiledIsolineBuilder`: Handles incremental isoline generation from tiled grid data

## Implementation Details

The tool follows the methodology described in the paper:

1. **CONREC Algorithm**: Generates initial contour segments by examining each grid cell
2. **Spatial Indexing**: Uses a grid-based spatial index to efficiently find neighboring segments
3. **Segment Connection**: Employs heuristics to connect segments into continuous isolines
4. **Polygon Closure**: Ensures all isolines form closed polygons for GIS operations
5. **Handling Unclosed Isolines**: Implements special techniques to handle gaps in data
6. **Tile-based Processing**: Supports incremental construction of isolines as data tiles arrive

## Usage Examples

### Basic Example

```javascript
const isolines = require('./src/index');

// Example array of values (3x3 grid)
const values = [
  10, 20, 30,
  40, 50, 60,
  70, 80, 90
];

// Generate isolines with specific grid dimensions
const geojson = isolines.generateIsolinesFromValues(values, {
  width: 3,
  height: 3
});

console.log(JSON.stringify(geojson, null, 2));
```

### Tile-based Processing Example

```javascript
const { TiledIsolineBuilder } = require('./src/index');

// Create a tiled isoline builder with contour levels and tile size
const builder = new TiledIsolineBuilder([15, 25, 35, 45, 55, 65, 75, 85], 128);

// Add tiles as they become available
builder.addTile(0, 0, tile1Data);
builder.addTile(0, 1, tile2Data);
builder.addTile(1, 0, tile3Data);

// Get the current state of isolines at any point
const currentIsolines = builder.getIsolinesAsGeoJSON();
```

### Command-line GeoJSON Generation

The repo contains a command-line tool to generate GeoJSON files from input values:

```bash
# Basic usage
node src/visualize/generate-geojson.js "[10, 20, 30, 40, 50, 60, 70, 80, 90]"

# Process a CSV file with options
node src/visualize/generate-geojson.js data.csv "{\"sampleEvery\":4,\"tileSize\":128}"

# Simulate WMTS tile-by-tile arrival
node src/visualize/generate-geojson.js --simulate-wmts data.csv "{\"tileSize\":128,\"randomOrder\":true}"
```

This will process the input values and save the resulting GeoJSON to `src/visualize/output/isolines.geojson`.

## Web Visualization

The repo contains a web-based visualization tool that allows you to:

1. Import CSV data files
2. Generate isolines from the data
3. Visualize the isolines on an interactive map
4. Customize contour levels and downsampling

### Running the Visualization Tool

Open `src/visualize/web-visual.html` in a web browser to use the visualization tool.

### Features of the Visualization Tool

- **CSV Import**: Load your own CSV data or use the sample data
- **Downsampling**: Adjust the downsampling factor for large datasets
- **Contour Levels**: Customize the number of contour levels
- **Interactive Map**: View isolines on a Leaflet map with color-coded levels
- **Progress Tracking**: Monitor processing progress for large datasets

## Output Format

The tool outputs GeoJSON with each isoline as a polygon. Each polygon has a `level` property indicating the contour level it represents.

Example output:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "level": 15
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [0.5, 0.166],
            [0.166, 0.5],
            [0.5, 0.833],
            [0.833, 0.5],
            [0.5, 0.166]
          ]
        ]
      }
    }
  ]
}
```

## Performance Considerations

- For large datasets, use the downsampling feature to improve performance
- The tool implements chunked processing to handle large CSV files efficiently
- Progress tracking is available for long-running operations
- Connecting segments into polygons significantly reduces the number of objects for visualization
- For very large datasets, the tile-based approach provides better memory efficiency
- Automatic sampling (every 4 points) is applied to datasets with more than 1 million values

## WMTS Integration

The tool includes special support for integration with Web Map Tile Service (WMTS) and other tile-based services:

- **Incremental Processing**: Build isolines as tiles arrive, rather than requiring the entire grid at once
- **Tile Boundary Handling**: Properly merge isolines that cross tile boundaries
- **Edge Point Tracking**: Maintain edge points to facilitate merging across tiles
- **Simulation Tools**: Test and visualize how isolines evolve as tiles arrive in different orders

This makes the tool suitable for applications where data is served in parts via tile-based protocols, and the entire grid is not available at once.

## Applications

This tool is particularly useful for:

- Meteorological data visualization (pressure, temperature, etc.)
- Terrain elevation mapping
- Web-based GIS applications with large datasets
- Applications requiring integration with tile-based services
- Any application requiring contour lines from gridded data

## Research Background

This implementation is based on the paper "EFFICIENT ISOLINES CONSTRUCTION METHOD FOR VISUALIZATION OF GRIDDED GEOREFERENCED DATA" by R.A. Rodriges Zalipynis (Donetsk National Technical University), which describes an efficient three-stage method for constructing georeferenced isolines for global regular latitude-longitude grids.

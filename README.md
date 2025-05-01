# Isolines-JS

A JavaScript tool for generating isolines (contour lines) from arrays of values.


## API

### generateIsolinesFromValues(values, options)

Generates isolines from a 1D array of values.

- `values`: Array of numeric values
- `options`: (Optional) Configuration object
  - `width`: Width of the grid (optional, defaults to square grid)
  - `height`: Height of the grid (optional)

Returns a GeoJSON FeatureCollection.

### generateIsolines(grid, levels)

Generates isolines from a 2D grid of values.

- `grid`: 2D array of numeric values
- `levels`: Array of contour levels to generate

### Usage
Returns a GeoJSON FeatureCollection.
```

Create a simple example file

```javascript:examples/simple.js
const isolines = require('../src/index');

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

## Output

The tool outputs GeoJSON with each isoline as a polygon. Each polygon has a `level` property indicating which value from the input array it corresponds to.

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

## How to Run the Example

```bash
mkdir -p examples
# Create the example file as shown above
node examples/simple.js

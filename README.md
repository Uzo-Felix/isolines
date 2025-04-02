# Isoline Visualization with Javascript

A application for visualizing isolines, using:
- CONREC algorithm for contour generation



## Features
- Adaptive contour level calculation

## Prerequisites
- Node.js v16+
- npm/yarn
- CSV data file (see [Data Preparation](#data-preparation))

## Getting Started

### 1. Clone Repository
```bash
git clone https://github.com/Uzo-Felix/isolines.git
git branch -M main
cd isolines
```

### 2. Install Dependencies
```bash
npm install
# or
yarn install
```

### 3. Data Preparation
1. **Obtain ERA5 Data**:
   - Download MSLP data from [Copernicus Climate Data Store](https://cds.climate.copernicus.eu/)
   - Use Panoply to export as CSV:
     - File → Export → CSV
     - Save as `msl.csv`

```bash
mv msl.csv data/
```



### 4. Run Application
```bash
npm start
```

## Project Structure
```text
├── public/data/               
│   └── msl.csv              # ERA5 data file 
├── src/
│   ├── components/          # Visualization components
│   └── utils/               # CONREC algorithm implementation
```

## Key Implementation Details

### Data Processing
- **Chunking**: 100 rows per chunk (configurable)
- **Coordinate Handling**:
  - Normalizes longitude (-180° to 180°)
  - Special pole value handling
- **Value Scaling**: Automatic contour level calculation

### Visualization Features
- Dynamic D3.js coordinate system
- Viridis color scale for contour levels
- Automatic gap closing (μ = 1.5√2)
- Adaptive spatial indexing with grid buckets

### Performance Optimizations
- Web Worker parallel processing
- R-tree inspired spatial indexing
- Memory-efficient TypedArrays

## Customization
Modify in `src/App.tsx`:
```typescript
// Adjust contour levels
const step = range / 10; // Change denominator for different level density

// Modify visualization parameters
const xScale = d3.scaleLinear().domain([-180, 180])...
```
![image](https://github.com/user-attachments/assets/4651133d-4a04-4cf3-a670-4733aab6d7ae)


## Troubleshooting

### Common Issues
1. **Missing CSV File**
   - Ensure `msl.csv` exists in data directory



   

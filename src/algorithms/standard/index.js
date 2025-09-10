/**
 * Non-tiled Standard Approach
 */
const Conrec = require('../../core/conrec');
const IsolineBuilder = require('../../core/isolineBuilder');

class StandardIsolineGenerator {
    constructor(levels = []) {
        this.levels = levels;
        this.conrec = new Conrec();
        this.builder = new IsolineBuilder();
    }

    /**
     * Generate isolines from complete grid data
     * Compatible with existing tools
     */
    generateIsolines(gridData) {
        if (!gridData || gridData.length === 0) {
            throw new Error('Empty grid data');
        }

        // Generate segments for all levels
        const segments = this.conrec.computeSegments(gridData, this.levels);
        
        // Build isolines (without forced closure)
        const isolines = this.builder.buildIsolines(segments, 1);
        
        return isolines;
    }

    /**
     * Generate isolines and convert to GeoJSON
     * Drop-in replacement for existing generateStandardIsolines()
     */
    generateIsolinesAsGeoJSON(gridData, scaleFactor = 1000) {
        const isolines = this.generateIsolines(gridData);
        return this.isolinesToGeoJSON(isolines, scaleFactor);
    }

    /**
     * Convert isolines to GeoJSON (matches existing format)
     */
    isolinesToGeoJSON(isolines, scaleFactor = 1000) {
        const features = isolines.map(isoline => {
            const coordinates = isoline.map(point => [
                point.lon / scaleFactor,
                point.lat / scaleFactor
            ]);

            // Check if naturally closed
            const isClosed = coordinates.length > 0 && 
                coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
                coordinates[0][1] === coordinates[coordinates.length - 1][1];

            // Use LineString for open chains, Polygon for closed chains
            const geometryType = isClosed ? 'Polygon' : 'LineString';
            const geometryCoordinates = isClosed ? [coordinates] : coordinates;

            return {
                type: 'Feature',
                properties: {
                    level: isoline.level,
                    algorithm: 'standard',
                    closed: isClosed
                },
                geometry: {
                    type: geometryType,
                    coordinates: geometryCoordinates
                }
            };
        }).filter(feature => {
            const coords = feature.geometry.type === 'Polygon' 
                ? feature.geometry.coordinates[0] 
                : feature.geometry.coordinates;
            return coords.length >= 2 &&
                coords.every(coord => !isNaN(coord[0]) && !isNaN(coord[1]));
        });

        return {
            type: 'FeatureCollection',
            features: features
        };
    }
}

module.exports = StandardIsolineGenerator;

const StandardIsolineGenerator = require('./standard');
const TiledAlgorithms = require('./tiled');

const ALGORITHMS = {
    STANDARD: 'standard',
    TILED_LINESTRING: 'tiled-linestring',
    TILED_POLYGON: 'tiled-polygon',
    TILED_STRIP: 'tiled-strip',
    TILED_OVERLAPPING: 'tiled-overlapping',
    TILED_BUFFER: "tiled-buffer"
};

module.exports = {
    StandardIsolineGenerator,
    
    TiledAlgorithms,
    
    ALGORITHMS,
    
    createStandardGenerator: (levels) => new StandardIsolineGenerator(levels),
    createTiledBuilder: TiledAlgorithms.createTiledBuilder,
    generateTiledIsolines: TiledAlgorithms.generateTiledIsolines
};

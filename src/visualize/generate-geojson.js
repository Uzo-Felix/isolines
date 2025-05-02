const fs = require('fs');
const path = require('path');
const { generateIsolinesFromValues } = require('../index');

// Parse user input
function parseInputValues(input) {
    try {
        return JSON.parse(input);
    } catch (error) {
        console.error('Invalid input. Please provide a valid JSON array of values.');
        process.exit(1);
    }
}

// Create output directory if it doesn't exist
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// Check for user input
const userInput = process.argv[2];
if (!userInput) {
    console.error('Error: No input provided. Please provide a JSON array of values as input.');
    process.exit(1);
}

console.log('processing...');
const values = parseInputValues(userInput);

// Validate input size
const size = Math.sqrt(values.length);

// Generate isolines
const geojson = generateIsolinesFromValues(values, {
    width: size,
    height: size
});

// Save to file
const outputPath = path.join(outputDir, `isolines.geojson`);
fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
console.log(`Saved to ${outputPath}`);
console.log('Done!');
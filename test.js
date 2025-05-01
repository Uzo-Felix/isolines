const isolines = require('./src/index');

const values = [
  10, 20, 30,
  40, 50, 60,
  70, 80, 90
];

const geojson = isolines.generateIsolinesFromValues(values, {
  width: 3,
  height: 3
});

console.log(JSON.stringify(geojson, null, 2));
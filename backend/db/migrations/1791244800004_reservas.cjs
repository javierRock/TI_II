const fs = require('node:fs');
const path = require('node:path');
exports.up = (pgm) => pgm.sql(fs.readFileSync(path.join(__dirname, '../sql/005_reservas.sql'), 'utf8'));
exports.down = () => { throw new Error('Conservar reservas y entregas; aplicar una migración correctiva.'); };

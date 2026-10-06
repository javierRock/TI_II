const fs = require('node:fs');
const path = require('node:path');

exports.up = (pgm) => {
  pgm.sql(fs.readFileSync(path.join(__dirname, '../sql/004_inspeccion_politicas.sql'), 'utf8'));
};
exports.down = () => {
  throw new Error('Conservar inspecciones e historial de políticas; aplicar una migración correctiva.');
};

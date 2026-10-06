const fs = require('node:fs');
const path = require('node:path');

exports.up = (pgm) => {
  pgm.sql(fs.readFileSync(path.join(__dirname, '../sql/001_nucleo.sql'), 'utf8'));
};

exports.down = () => {
  throw new Error('Migración inicial no reversible: proteger el historial. Restaurar un respaldo o aplicar una migración correctiva.');
};

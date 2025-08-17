/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  pgm.addColumn('npcs', {
    current_encounter_id: { type: 'integer', references: 'encounters' },
  });
  pgm.createIndex('npcs', 'current_encounter_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.dropIndex('npcs', 'current_encounter_id');
  pgm.dropColumn('npcs', 'current_encounter_id');
};



/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  pgm.createTable('users', {
    id: 'id',
    google_sub: { type: 'text', notNull: true, unique: true },
    email: { type: 'text' },
    display_name: { type: 'text' },
    role: { type: 'text', notNull: true, default: 'user' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('npcs', {
    id: 'id',
    owner_id: { type: 'integer', notNull: true, references: 'users' },
    name: { type: 'text', notNull: true },
    sections_json: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    image_url: { type: 'text' },
    voice_id: { type: 'text' },
    defaults_json: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('encounters', {
    id: 'id',
    npc_id: { type: 'integer', notNull: true, references: 'npcs' },
    slug: { type: 'text', notNull: true, unique: true },
    state_json: { type: 'jsonb', notNull: true, default: pgm.func('\'{"patience":5,"interest":5}\'::jsonb') },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('encounter_messages', {
    id: 'id',
    encounter_id: { type: 'integer', notNull: true, references: 'encounters' },
    author_type: { type: 'text', notNull: true },
    text: { type: 'text', notNull: true },
    audio_url: { type: 'text' },
    model_meta_json: { type: 'jsonb', default: pgm.func("'{}'::jsonb") },
    flags_json: { type: 'jsonb', default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('audit_log', {
    id: 'id',
    actor_user_id: { type: 'integer', references: 'users' },
    action: { type: 'text', notNull: true },
    target_type: { type: 'text' },
    target_id: { type: 'integer' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.dropTable('audit_log');
  pgm.dropTable('encounter_messages');
  pgm.dropTable('encounters');
  pgm.dropTable('npcs');
  pgm.dropTable('users');
};



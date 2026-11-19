-- Brings existing tables in line with app/db/models.py.
-- Base.metadata.create_all() only creates missing tables; it never adds columns
-- to tables that already exist, so these changes have to be applied by hand.

BEGIN;

-- Timestamp columns from BaseTables
ALTER TABLE "fieldType"
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now(),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

ALTER TABLE "fileAttachments"
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now(),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

ALTER TABLE chatmessages
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now(),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

ALTER TABLE formfields
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now(),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

ALTER TABLE capa_actions
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now(),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

ALTER TABLE investigations
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

-- chatmessages: agent response and attachment are filled in later, so allow NULL
ALTER TABLE chatmessages ALTER COLUMN "agentResponse" DROP NOT NULL;
ALTER TABLE chatmessages ALTER COLUMN "fileAttachmentsId" DROP NOT NULL;

-- fields: the table was created from an old copy of FormFields
-- (form_name, form_description, user_id). It is empty, so recreate it.
DROP TABLE IF EXISTS fields;
CREATE TABLE fields (
    id                SERIAL PRIMARY KEY,
    field_name        VARCHAR NOT NULL,
    field_description VARCHAR NOT NULL,
    field_type_id     INTEGER NOT NULL REFERENCES "fieldType"(id),
    form_id           INTEGER NOT NULL REFERENCES formfields(id) ON DELETE CASCADE,
    created_at        TIMESTAMP DEFAULT now(),
    updated_at        TIMESTAMP DEFAULT now(),
    deleted_at        TIMESTAMP NULL
);
CREATE INDEX IF NOT EXISTS ix_fields_id ON fields (id);

COMMIT;

CREATE TABLE IF NOT EXISTS waterq.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NULL,
    display_name TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE waterq.users OWNER TO postgres;

CREATE INDEX IF NOT EXISTS user_email_idx ON waterq.users USING btree (email DESC);
-- Casilla virtual de gastos: correos recibidos por Resend (mail.spendplan.cl)
-- El webhook usa service role; los miembros solo pueden leer los de su hogar.

CREATE TABLE IF NOT EXISTS inbound_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    resend_email_id TEXT NOT NULL UNIQUE,
    from_address TEXT,
    to_addresses TEXT[],
    subject TEXT,
    text_body TEXT,
    parsed JSONB,
    expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'received',
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_household
    ON inbound_emails (household_id);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_created
    ON inbound_emails (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_households_inbound_token
    ON households ((settings->>'inbound_email_token'));

ALTER TABLE inbound_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view household inbound emails"
    ON inbound_emails FOR SELECT
    USING (is_household_member(household_id));

COMMENT ON TABLE inbound_emails IS 'Correos inbound de Resend (casilla gastos+token@mail.spendplan.cl)';

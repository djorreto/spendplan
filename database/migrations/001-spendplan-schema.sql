-- ========================================
-- 🏠 SPENDPLAN - ESQUEMA DE BASE DE DATOS
-- ========================================
-- MVP para presupuesto y seguimiento de gastos del hogar/familia
-- Ejecutar en Supabase SQL Editor

-- ========================================
-- EXTENSIONES
-- ========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================
-- FUNCIÓN PARA UPDATED_AT
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ========================================
-- TIPOS ENUM
-- ========================================
CREATE TYPE membership_role AS ENUM ('owner', 'member');
CREATE TYPE payment_method AS ENUM ('cash', 'debit', 'credit', 'transfer', 'unknown');
CREATE TYPE expense_status AS ENUM ('confirmed', 'pending', 'cancelled');
CREATE TYPE expense_source AS ENUM ('manual', 'whatsapp', 'csv_import', 'api');
CREATE TYPE transaction_status AS ENUM ('unreconciled', 'reconciled', 'ignored');
CREATE TYPE ai_request_type AS ENUM ('categorize', 'insights', 'ocr', 'parse_message');

-- ========================================
-- TABLA: HOUSEHOLDS (Hogares)
-- ========================================
CREATE TABLE IF NOT EXISTS households (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    currency VARCHAR(3) DEFAULT 'CLP',
    timezone VARCHAR(50) DEFAULT 'America/Santiago',
    whatsapp_phone_number VARCHAR(20),
    whatsapp_verified BOOLEAN DEFAULT false,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_households_updated_at
    BEFORE UPDATE ON households
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE households IS 'Hogares/Familias - unidad principal de agrupación';

-- ========================================
-- TABLA: PROFILES (Usuarios extendidos)
-- ========================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255),
    avatar_url TEXT,
    phone VARCHAR(50),
    preferred_currency VARCHAR(3) DEFAULT 'CLP',
    onboarding_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_email ON profiles(email);

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE profiles IS 'Perfiles de usuario extendidos';

-- ========================================
-- TABLA: HOUSEHOLD_MEMBERSHIPS (Membresías)
-- ========================================
CREATE TABLE IF NOT EXISTS household_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role membership_role DEFAULT 'member',
    invited_by UUID REFERENCES profiles(id),
    invited_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(household_id, user_id)
);

CREATE INDEX idx_memberships_household ON household_memberships(household_id);
CREATE INDEX idx_memberships_user ON household_memberships(user_id);

CREATE TRIGGER update_memberships_updated_at
    BEFORE UPDATE ON household_memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE household_memberships IS 'Membresías de usuarios a hogares';

-- ========================================
-- TABLA: CATEGORIES (Categorías de gastos)
-- ========================================
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID REFERENCES households(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    color VARCHAR(7), -- hex color
    is_system BOOLEAN DEFAULT false, -- categorías del sistema
    parent_id UUID REFERENCES categories(id),
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_categories_household ON categories(household_id);

CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE categories IS 'Categorías de gastos (sistema + custom por hogar)';

-- ========================================
-- TABLA: MONTHLY_BUDGETS (Presupuestos mensuales)
-- ========================================
CREATE TABLE IF NOT EXISTS monthly_budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL, -- formato YYYY-MM
    notes TEXT,
    is_locked BOOLEAN DEFAULT false,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(household_id, month)
);

CREATE INDEX idx_budgets_household_month ON monthly_budgets(household_id, month);

CREATE TRIGGER update_budgets_updated_at
    BEFORE UPDATE ON monthly_budgets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE monthly_budgets IS 'Presupuestos mensuales por hogar';

-- ========================================
-- TABLA: BUDGET_LINES (Líneas de presupuesto)
-- ========================================
CREATE TABLE IF NOT EXISTS budget_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    budget_id UUID NOT NULL REFERENCES monthly_budgets(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id),
    amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(budget_id, category_id)
);

CREATE INDEX idx_budget_lines_budget ON budget_lines(budget_id);

CREATE TRIGGER update_budget_lines_updated_at
    BEFORE UPDATE ON budget_lines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE budget_lines IS 'Líneas de presupuesto por categoría';

-- ========================================
-- TABLA: INCOME_ITEMS (Ingresos proyectados)
-- ========================================
CREATE TABLE IF NOT EXISTS income_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    budget_id UUID NOT NULL REFERENCES monthly_budgets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    is_recurring BOOLEAN DEFAULT false,
    source VARCHAR(100), -- sueldo, arriendo, variable, etc.
    user_id UUID REFERENCES profiles(id), -- quién recibe este ingreso
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_income_items_budget ON income_items(budget_id);

CREATE TRIGGER update_income_items_updated_at
    BEFORE UPDATE ON income_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE income_items IS 'Ingresos proyectados por mes';

-- ========================================
-- TABLA: EXPENSES (Gastos reales)
-- ========================================
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id),
    amount DECIMAL(15,2) NOT NULL,
    description VARCHAR(500),
    merchant VARCHAR(255),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method payment_method DEFAULT 'unknown',
    account VARCHAR(100), -- cuenta bancaria opcional
    status expense_status DEFAULT 'confirmed',
    source expense_source DEFAULT 'manual',
    tags TEXT[],
    notes TEXT,
    -- AI categorization
    ai_category_suggestion UUID REFERENCES categories(id),
    ai_confidence DECIMAL(3,2) DEFAULT 0.5,
    ai_reason TEXT,
    -- Auditoría
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_household ON expenses(household_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_household_date ON expenses(household_id, expense_date);
CREATE INDEX idx_expenses_status ON expenses(status);

CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE expenses IS 'Gastos reales registrados';

-- ========================================
-- TABLA: EXPENSE_ATTACHMENTS (Adjuntos/Boletas)
-- ========================================
CREATE TABLE IF NOT EXISTS expense_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name VARCHAR(255),
    file_type VARCHAR(100),
    file_size BIGINT,
    ocr_text TEXT,
    ocr_extracted_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attachments_expense ON expense_attachments(expense_id);

COMMENT ON TABLE expense_attachments IS 'Archivos adjuntos de gastos (boletas, facturas)';

-- ========================================
-- TABLA: BANK_TRANSACTIONS (Transacciones bancarias)
-- ========================================
CREATE TABLE IF NOT EXISTS bank_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    import_batch_id UUID, -- para agrupar imports
    transaction_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    reference VARCHAR(255),
    account VARCHAR(100),
    bank_name VARCHAR(100),
    status transaction_status DEFAULT 'unreconciled',
    raw_data JSONB,
    imported_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bank_tx_household ON bank_transactions(household_id);
CREATE INDEX idx_bank_tx_date ON bank_transactions(transaction_date);
CREATE INDEX idx_bank_tx_status ON bank_transactions(status);
CREATE INDEX idx_bank_tx_batch ON bank_transactions(import_batch_id);

CREATE TRIGGER update_bank_tx_updated_at
    BEFORE UPDATE ON bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE bank_transactions IS 'Transacciones importadas desde banco (CSV)';

-- ========================================
-- TABLA: RECONCILIATION_LINKS (Conciliación)
-- ========================================
CREATE TABLE IF NOT EXISTS reconciliation_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_transaction_id UUID NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    match_confidence DECIMAL(3,2),
    match_reason TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(bank_transaction_id, expense_id)
);

CREATE INDEX idx_reconciliation_bank ON reconciliation_links(bank_transaction_id);
CREATE INDEX idx_reconciliation_expense ON reconciliation_links(expense_id);

COMMENT ON TABLE reconciliation_links IS 'Links de conciliación banco-gastos';

-- ========================================
-- TABLA: CATEGORIZATION_RULES (Reglas de categorización)
-- ========================================
CREATE TABLE IF NOT EXISTS categorization_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id),
    rule_type VARCHAR(50) DEFAULT 'contains', -- contains, exact, regex, starts_with
    pattern VARCHAR(500) NOT NULL,
    is_case_sensitive BOOLEAN DEFAULT false,
    priority INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rules_household ON categorization_rules(household_id);

CREATE TRIGGER update_rules_updated_at
    BEFORE UPDATE ON categorization_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE categorization_rules IS 'Reglas de categorización automática';

-- ========================================
-- TABLA: AI_CONFIG (Configuración de IA por hogar)
-- ========================================
CREATE TABLE IF NOT EXISTS ai_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'mock', -- mock, grok, openai, anthropic
    api_key_ref TEXT, -- referencia cifrada o ID de vault
    model VARCHAR(100),
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(household_id)
);

CREATE INDEX idx_ai_config_household ON ai_config(household_id);

CREATE TRIGGER update_ai_config_updated_at
    BEFORE UPDATE ON ai_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ai_config IS 'Configuración del proveedor de IA por hogar';

-- ========================================
-- TABLA: AI_LOGS (Logs de solicitudes a IA)
-- ========================================
CREATE TABLE IF NOT EXISTS ai_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    request_type ai_request_type NOT NULL,
    provider VARCHAR(50),
    model VARCHAR(100),
    input_data JSONB,
    output_data JSONB,
    tokens_used INT,
    latency_ms INT,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_logs_household ON ai_logs(household_id);
CREATE INDEX idx_ai_logs_type ON ai_logs(request_type);
CREATE INDEX idx_ai_logs_created ON ai_logs(created_at);

COMMENT ON TABLE ai_logs IS 'Logs de solicitudes a proveedores de IA';

-- ========================================
-- TABLA: WHATSAPP_MESSAGES_IN (Mensajes entrantes)
-- ========================================
CREATE TABLE IF NOT EXISTS whatsapp_messages_in (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID REFERENCES households(id) ON DELETE SET NULL,
    from_number VARCHAR(20) NOT NULL,
    message_id VARCHAR(255),
    message_type VARCHAR(50), -- text, image, document
    content TEXT,
    media_url TEXT,
    media_id VARCHAR(255),
    parsed_data JSONB,
    expense_id UUID REFERENCES expenses(id),
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wa_in_household ON whatsapp_messages_in(household_id);
CREATE INDEX idx_wa_in_from ON whatsapp_messages_in(from_number);
CREATE INDEX idx_wa_in_processed ON whatsapp_messages_in(processed);

COMMENT ON TABLE whatsapp_messages_in IS 'Log de mensajes entrantes de WhatsApp';

-- ========================================
-- TABLA: WHATSAPP_MESSAGES_OUT (Mensajes salientes)
-- ========================================
CREATE TABLE IF NOT EXISTS whatsapp_messages_out (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID REFERENCES households(id) ON DELETE SET NULL,
    to_number VARCHAR(20) NOT NULL,
    message_id VARCHAR(255),
    content TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'sent',
    related_expense_id UUID REFERENCES expenses(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wa_out_household ON whatsapp_messages_out(household_id);

COMMENT ON TABLE whatsapp_messages_out IS 'Log de mensajes salientes de WhatsApp';

-- ========================================
-- TABLA: INSIGHTS_REPORTS (Reportes de insights)
-- ========================================
CREATE TABLE IF NOT EXISTS insights_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL, -- YYYY-MM
    insights JSONB NOT NULL, -- bullets, flags, recommendations
    recommended_budget JSONB, -- sugerencia de presupuesto
    ai_provider VARCHAR(50),
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(household_id, month)
);

CREATE INDEX idx_insights_household_month ON insights_reports(household_id, month);

COMMENT ON TABLE insights_reports IS 'Reportes de insights generados por IA';

-- ========================================
-- TABLA: HOUSEHOLD_INVITATIONS (Invitaciones pendientes)
-- ========================================
CREATE TABLE IF NOT EXISTS household_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role membership_role DEFAULT 'member',
    token VARCHAR(255) NOT NULL UNIQUE,
    invited_by UUID NOT NULL REFERENCES profiles(id),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invitations_token ON household_invitations(token);
CREATE INDEX idx_invitations_email ON household_invitations(email);

COMMENT ON TABLE household_invitations IS 'Invitaciones pendientes a hogares';

-- ========================================
-- FUNCIÓN: Crear perfil automáticamente
-- ========================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Trigger para crear perfil automático
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ========================================
-- FUNCIÓN: monthly_summary
-- ========================================
CREATE OR REPLACE FUNCTION monthly_summary(p_household_id UUID, p_month VARCHAR(7))
RETURNS TABLE (
    category_id UUID,
    category_name VARCHAR(100),
    budgeted DECIMAL(15,2),
    spent DECIMAL(15,2),
    difference DECIMAL(15,2),
    percentage DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as category_id,
        c.name as category_name,
        COALESCE(bl.amount, 0) as budgeted,
        COALESCE(SUM(e.amount), 0) as spent,
        COALESCE(bl.amount, 0) - COALESCE(SUM(e.amount), 0) as difference,
        CASE 
            WHEN COALESCE(bl.amount, 0) > 0 
            THEN ROUND((COALESCE(SUM(e.amount), 0) / bl.amount * 100)::numeric, 2)
            ELSE 0
        END as percentage
    FROM categories c
    LEFT JOIN monthly_budgets mb ON mb.household_id = p_household_id AND mb.month = p_month
    LEFT JOIN budget_lines bl ON bl.budget_id = mb.id AND bl.category_id = c.id
    LEFT JOIN expenses e ON e.category_id = c.id 
        AND e.household_id = p_household_id 
        AND TO_CHAR(e.expense_date, 'YYYY-MM') = p_month
        AND e.status = 'confirmed'
    WHERE c.household_id = p_household_id OR c.is_system = true
    GROUP BY c.id, c.name, bl.amount
    ORDER BY spent DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- FUNCIÓN: get_monthly_totals
-- ========================================
CREATE OR REPLACE FUNCTION get_monthly_totals(p_household_id UUID, p_month VARCHAR(7))
RETURNS TABLE (
    total_income DECIMAL(15,2),
    total_budgeted DECIMAL(15,2),
    total_spent DECIMAL(15,2),
    available DECIMAL(15,2),
    budget_used_percentage DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    WITH income AS (
        SELECT COALESCE(SUM(ii.amount), 0) as total
        FROM income_items ii
        JOIN monthly_budgets mb ON mb.id = ii.budget_id
        WHERE mb.household_id = p_household_id AND mb.month = p_month
    ),
    budget AS (
        SELECT COALESCE(SUM(bl.amount), 0) as total
        FROM budget_lines bl
        JOIN monthly_budgets mb ON mb.id = bl.budget_id
        WHERE mb.household_id = p_household_id AND mb.month = p_month
    ),
    spent AS (
        SELECT COALESCE(SUM(e.amount), 0) as total
        FROM expenses e
        WHERE e.household_id = p_household_id 
        AND TO_CHAR(e.expense_date, 'YYYY-MM') = p_month
        AND e.status = 'confirmed'
    )
    SELECT 
        income.total as total_income,
        budget.total as total_budgeted,
        spent.total as total_spent,
        income.total - spent.total as available,
        CASE 
            WHEN budget.total > 0 
            THEN ROUND((spent.total / budget.total * 100)::numeric, 2)
            ELSE 0
        END as budget_used_percentage
    FROM income, budget, spent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

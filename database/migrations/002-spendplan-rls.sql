-- ========================================
-- 🔐 SPENDPLAN - ROW LEVEL SECURITY (RLS)
-- ========================================
-- Políticas de seguridad para multi-tenancy por hogar
-- Ejecutar después del esquema inicial

-- ========================================
-- FUNCIONES HELPER
-- ========================================

-- Obtener IDs de hogares donde el usuario es miembro
CREATE OR REPLACE FUNCTION auth.user_household_ids()
RETURNS UUID[] AS $$
    SELECT ARRAY_AGG(household_id) 
    FROM household_memberships 
    WHERE user_id = auth.uid() AND is_active = true
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Verificar si usuario es miembro de un hogar
CREATE OR REPLACE FUNCTION auth.is_household_member(p_household_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM household_memberships 
        WHERE user_id = auth.uid() 
        AND household_id = p_household_id 
        AND is_active = true
    )
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Verificar si usuario es owner de un hogar
CREATE OR REPLACE FUNCTION auth.is_household_owner(p_household_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM household_memberships 
        WHERE user_id = auth.uid() 
        AND household_id = p_household_id 
        AND role = 'owner'
        AND is_active = true
    )
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ========================================
-- RLS: PROFILES
-- ========================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can view profiles of household members"
    ON profiles FOR SELECT
    USING (
        id IN (
            SELECT hm.user_id FROM household_memberships hm
            WHERE hm.household_id = ANY(auth.user_household_ids())
            AND hm.is_active = true
        )
    );

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ========================================
-- RLS: HOUSEHOLDS
-- ========================================
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their households"
    ON households FOR SELECT
    USING (auth.is_household_member(id));

CREATE POLICY "Owners can update their households"
    ON households FOR UPDATE
    USING (auth.is_household_owner(id));

CREATE POLICY "Users can create households"
    ON households FOR INSERT
    WITH CHECK (true); -- La membresía se crea después

CREATE POLICY "Owners can delete their households"
    ON households FOR DELETE
    USING (auth.is_household_owner(id));

-- ========================================
-- RLS: HOUSEHOLD_MEMBERSHIPS
-- ========================================
ALTER TABLE household_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view memberships of their households"
    ON household_memberships FOR SELECT
    USING (auth.is_household_member(household_id));

CREATE POLICY "Owners can manage memberships"
    ON household_memberships FOR INSERT
    WITH CHECK (
        auth.is_household_owner(household_id) 
        OR (user_id = auth.uid() AND role = 'owner') -- Para crear el primer owner
    );

CREATE POLICY "Owners can update memberships"
    ON household_memberships FOR UPDATE
    USING (auth.is_household_owner(household_id));

CREATE POLICY "Members can leave, owners can remove"
    ON household_memberships FOR DELETE
    USING (
        user_id = auth.uid() 
        OR auth.is_household_owner(household_id)
    );

-- ========================================
-- RLS: CATEGORIES
-- ========================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view system categories"
    ON categories FOR SELECT
    USING (is_system = true);

CREATE POLICY "Members can view household categories"
    ON categories FOR SELECT
    USING (auth.is_household_member(household_id));

CREATE POLICY "Members can create household categories"
    ON categories FOR INSERT
    WITH CHECK (auth.is_household_member(household_id));

CREATE POLICY "Members can update household categories"
    ON categories FOR UPDATE
    USING (auth.is_household_member(household_id));

CREATE POLICY "Owners can delete household categories"
    ON categories FOR DELETE
    USING (auth.is_household_owner(household_id));

-- ========================================
-- RLS: MONTHLY_BUDGETS
-- ========================================
ALTER TABLE monthly_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view household budgets"
    ON monthly_budgets FOR SELECT
    USING (auth.is_household_member(household_id));

CREATE POLICY "Members can create household budgets"
    ON monthly_budgets FOR INSERT
    WITH CHECK (auth.is_household_member(household_id));

CREATE POLICY "Members can update household budgets"
    ON monthly_budgets FOR UPDATE
    USING (auth.is_household_member(household_id) AND NOT is_locked);

CREATE POLICY "Owners can delete household budgets"
    ON monthly_budgets FOR DELETE
    USING (auth.is_household_owner(household_id));

-- ========================================
-- RLS: BUDGET_LINES
-- ========================================
ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view budget lines"
    ON budget_lines FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM monthly_budgets mb
            WHERE mb.id = budget_id 
            AND auth.is_household_member(mb.household_id)
        )
    );

CREATE POLICY "Members can manage budget lines"
    ON budget_lines FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM monthly_budgets mb
            WHERE mb.id = budget_id 
            AND auth.is_household_member(mb.household_id)
        )
    );

CREATE POLICY "Members can update budget lines"
    ON budget_lines FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM monthly_budgets mb
            WHERE mb.id = budget_id 
            AND auth.is_household_member(mb.household_id)
            AND NOT mb.is_locked
        )
    );

CREATE POLICY "Members can delete budget lines"
    ON budget_lines FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM monthly_budgets mb
            WHERE mb.id = budget_id 
            AND auth.is_household_member(mb.household_id)
        )
    );

-- ========================================
-- RLS: INCOME_ITEMS
-- ========================================
ALTER TABLE income_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view income items"
    ON income_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM monthly_budgets mb
            WHERE mb.id = budget_id 
            AND auth.is_household_member(mb.household_id)
        )
    );

CREATE POLICY "Members can manage income items"
    ON income_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM monthly_budgets mb
            WHERE mb.id = budget_id 
            AND auth.is_household_member(mb.household_id)
        )
    );

-- ========================================
-- RLS: EXPENSES
-- ========================================
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view household expenses"
    ON expenses FOR SELECT
    USING (auth.is_household_member(household_id));

CREATE POLICY "Members can create household expenses"
    ON expenses FOR INSERT
    WITH CHECK (auth.is_household_member(household_id));

CREATE POLICY "Members can update household expenses"
    ON expenses FOR UPDATE
    USING (auth.is_household_member(household_id));

CREATE POLICY "Members can delete household expenses"
    ON expenses FOR DELETE
    USING (auth.is_household_member(household_id));

-- ========================================
-- RLS: EXPENSE_ATTACHMENTS
-- ========================================
ALTER TABLE expense_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view attachments"
    ON expense_attachments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM expenses e
            WHERE e.id = expense_id 
            AND auth.is_household_member(e.household_id)
        )
    );

CREATE POLICY "Members can manage attachments"
    ON expense_attachments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM expenses e
            WHERE e.id = expense_id 
            AND auth.is_household_member(e.household_id)
        )
    );

-- ========================================
-- RLS: BANK_TRANSACTIONS
-- ========================================
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view bank transactions"
    ON bank_transactions FOR SELECT
    USING (auth.is_household_member(household_id));

CREATE POLICY "Members can manage bank transactions"
    ON bank_transactions FOR ALL
    USING (auth.is_household_member(household_id));

-- ========================================
-- RLS: RECONCILIATION_LINKS
-- ========================================
ALTER TABLE reconciliation_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view reconciliation links"
    ON reconciliation_links FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bank_transactions bt
            WHERE bt.id = bank_transaction_id 
            AND auth.is_household_member(bt.household_id)
        )
    );

CREATE POLICY "Members can manage reconciliation links"
    ON reconciliation_links FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM bank_transactions bt
            WHERE bt.id = bank_transaction_id 
            AND auth.is_household_member(bt.household_id)
        )
    );

-- ========================================
-- RLS: CATEGORIZATION_RULES
-- ========================================
ALTER TABLE categorization_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view household rules"
    ON categorization_rules FOR SELECT
    USING (auth.is_household_member(household_id));

CREATE POLICY "Members can manage household rules"
    ON categorization_rules FOR ALL
    USING (auth.is_household_member(household_id));

-- ========================================
-- RLS: AI_CONFIG
-- ========================================
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view AI config"
    ON ai_config FOR SELECT
    USING (auth.is_household_member(household_id));

CREATE POLICY "Owners can manage AI config"
    ON ai_config FOR ALL
    USING (auth.is_household_owner(household_id));

-- ========================================
-- RLS: AI_LOGS
-- ========================================
ALTER TABLE ai_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view AI logs"
    ON ai_logs FOR SELECT
    USING (auth.is_household_member(household_id));

CREATE POLICY "System can insert AI logs"
    ON ai_logs FOR INSERT
    WITH CHECK (auth.is_household_member(household_id));

-- ========================================
-- RLS: WHATSAPP_MESSAGES_IN
-- ========================================
ALTER TABLE whatsapp_messages_in ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view inbound messages"
    ON whatsapp_messages_in FOR SELECT
    USING (household_id IS NULL OR auth.is_household_member(household_id));

CREATE POLICY "System can insert inbound messages"
    ON whatsapp_messages_in FOR INSERT
    WITH CHECK (true);

-- ========================================
-- RLS: WHATSAPP_MESSAGES_OUT
-- ========================================
ALTER TABLE whatsapp_messages_out ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view outbound messages"
    ON whatsapp_messages_out FOR SELECT
    USING (household_id IS NULL OR auth.is_household_member(household_id));

CREATE POLICY "System can insert outbound messages"
    ON whatsapp_messages_out FOR INSERT
    WITH CHECK (true);

-- ========================================
-- RLS: INSIGHTS_REPORTS
-- ========================================
ALTER TABLE insights_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view insights"
    ON insights_reports FOR SELECT
    USING (auth.is_household_member(household_id));

CREATE POLICY "Members can manage insights"
    ON insights_reports FOR ALL
    USING (auth.is_household_member(household_id));

-- ========================================
-- RLS: HOUSEHOLD_INVITATIONS
-- ========================================
ALTER TABLE household_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view invitations"
    ON household_invitations FOR SELECT
    USING (auth.is_household_owner(household_id) OR email = auth.email());

CREATE POLICY "Owners can create invitations"
    ON household_invitations FOR INSERT
    WITH CHECK (auth.is_household_owner(household_id));

CREATE POLICY "Owners can delete invitations"
    ON household_invitations FOR DELETE
    USING (auth.is_household_owner(household_id));

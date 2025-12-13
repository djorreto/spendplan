-- ========================================
-- 📊 SPENDPLAN - FUNCIONES Y VIEWS
-- ========================================
-- Funciones útiles para cálculos y reportes

-- ========================================
-- FUNCIÓN: monthly_summary
-- Devuelve resumen del mes por categoría
-- ========================================
CREATE OR REPLACE FUNCTION monthly_summary(
    p_household_id UUID,
    p_month VARCHAR(7) -- YYYY-MM
)
RETURNS TABLE (
    category_id UUID,
    category_name VARCHAR,
    category_color VARCHAR,
    category_icon VARCHAR,
    budgeted_amount DECIMAL(15,2),
    actual_amount DECIMAL(15,2),
    expense_count BIGINT,
    difference DECIMAL(15,2),
    percentage_used DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    WITH budget_data AS (
        SELECT 
            bl.category_id,
            bl.planned_amount
        FROM monthly_budgets mb
        JOIN budget_lines bl ON bl.budget_id = mb.id
        WHERE mb.household_id = p_household_id
        AND mb.month = p_month
    ),
    expense_data AS (
        SELECT 
            e.category_id,
            COALESCE(SUM(e.amount), 0) as total_spent,
            COUNT(*) as cnt
        FROM expenses e
        WHERE e.household_id = p_household_id
        AND to_char(e.expense_date, 'YYYY-MM') = p_month
        GROUP BY e.category_id
    ),
    all_categories AS (
        SELECT id, name, color, icon
        FROM categories
        WHERE household_id = p_household_id OR household_id IS NULL
    )
    SELECT 
        c.id as category_id,
        c.name as category_name,
        c.color as category_color,
        c.icon as category_icon,
        COALESCE(bd.planned_amount, 0) as budgeted_amount,
        COALESCE(ed.total_spent, 0) as actual_amount,
        COALESCE(ed.cnt, 0) as expense_count,
        COALESCE(bd.planned_amount, 0) - COALESCE(ed.total_spent, 0) as difference,
        CASE 
            WHEN COALESCE(bd.planned_amount, 0) > 0 
            THEN ROUND((COALESCE(ed.total_spent, 0) / bd.planned_amount * 100)::numeric, 2)
            ELSE 0
        END as percentage_used
    FROM all_categories c
    LEFT JOIN budget_data bd ON bd.category_id = c.id
    LEFT JOIN expense_data ed ON ed.category_id = c.id
    WHERE bd.planned_amount > 0 OR ed.total_spent > 0
    ORDER BY COALESCE(ed.total_spent, 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- FUNCIÓN: monthly_totals
-- Devuelve totales del mes
-- ========================================
CREATE OR REPLACE FUNCTION monthly_totals(
    p_household_id UUID,
    p_month VARCHAR(7)
)
RETURNS TABLE (
    total_income DECIMAL(15,2),
    total_budgeted DECIMAL(15,2),
    total_spent DECIMAL(15,2),
    total_remaining DECIMAL(15,2),
    expense_count BIGINT,
    uncategorized_count BIGINT,
    budget_variance DECIMAL(15,2),
    savings_rate DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    WITH income AS (
        SELECT COALESCE(SUM(ii.amount), 0) as total
        FROM monthly_budgets mb
        JOIN income_items ii ON ii.budget_id = mb.id
        WHERE mb.household_id = p_household_id
        AND mb.month = p_month
    ),
    budget AS (
        SELECT COALESCE(SUM(bl.planned_amount), 0) as total
        FROM monthly_budgets mb
        JOIN budget_lines bl ON bl.budget_id = mb.id
        WHERE mb.household_id = p_household_id
        AND mb.month = p_month
    ),
    expenses AS (
        SELECT 
            COALESCE(SUM(amount), 0) as total,
            COUNT(*) as cnt,
            COUNT(*) FILTER (WHERE category_id IS NULL) as uncat_cnt
        FROM expenses
        WHERE household_id = p_household_id
        AND to_char(expense_date, 'YYYY-MM') = p_month
    )
    SELECT 
        i.total as total_income,
        b.total as total_budgeted,
        e.total as total_spent,
        i.total - e.total as total_remaining,
        e.cnt as expense_count,
        e.uncat_cnt as uncategorized_count,
        b.total - e.total as budget_variance,
        CASE 
            WHEN i.total > 0 
            THEN ROUND(((i.total - e.total) / i.total * 100)::numeric, 2)
            ELSE 0
        END as savings_rate
    FROM income i, budget b, expenses e;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- FUNCIÓN: daily_spending
-- Devuelve gasto diario del mes
-- ========================================
CREATE OR REPLACE FUNCTION daily_spending(
    p_household_id UUID,
    p_month VARCHAR(7)
)
RETURNS TABLE (
    expense_date DATE,
    daily_total DECIMAL(15,2),
    cumulative_total DECIMAL(15,2)
) AS $$
BEGIN
    RETURN QUERY
    WITH daily AS (
        SELECT 
            e.expense_date,
            SUM(e.amount) as daily_total
        FROM expenses e
        WHERE e.household_id = p_household_id
        AND to_char(e.expense_date, 'YYYY-MM') = p_month
        GROUP BY e.expense_date
    )
    SELECT 
        d.expense_date,
        d.daily_total,
        SUM(d.daily_total) OVER (ORDER BY d.expense_date) as cumulative_total
    FROM daily d
    ORDER BY d.expense_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- FUNCIÓN: top_merchants
-- Devuelve top comercios del mes
-- ========================================
CREATE OR REPLACE FUNCTION top_merchants(
    p_household_id UUID,
    p_month VARCHAR(7),
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    merchant VARCHAR,
    total_amount DECIMAL(15,2),
    transaction_count BIGINT,
    avg_amount DECIMAL(15,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(e.merchant, 'Sin comercio') as merchant,
        SUM(e.amount) as total_amount,
        COUNT(*) as transaction_count,
        ROUND(AVG(e.amount)::numeric, 2) as avg_amount
    FROM expenses e
    WHERE e.household_id = p_household_id
    AND to_char(e.expense_date, 'YYYY-MM') = p_month
    GROUP BY e.merchant
    ORDER BY total_amount DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- FUNCIÓN: category_trend
-- Devuelve tendencia de categoría últimos N meses
-- ========================================
CREATE OR REPLACE FUNCTION category_trend(
    p_household_id UUID,
    p_category_id UUID,
    p_months INT DEFAULT 6
)
RETURNS TABLE (
    month VARCHAR,
    total_amount DECIMAL(15,2),
    transaction_count BIGINT,
    avg_amount DECIMAL(15,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        to_char(e.expense_date, 'YYYY-MM') as month,
        SUM(e.amount) as total_amount,
        COUNT(*) as transaction_count,
        ROUND(AVG(e.amount)::numeric, 2) as avg_amount
    FROM expenses e
    WHERE e.household_id = p_household_id
    AND e.category_id = p_category_id
    AND e.expense_date >= (CURRENT_DATE - (p_months || ' months')::interval)
    GROUP BY to_char(e.expense_date, 'YYYY-MM')
    ORDER BY month DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- FUNCIÓN: apply_categorization_rules
-- Aplica reglas de categorización a un gasto
-- ========================================
CREATE OR REPLACE FUNCTION apply_categorization_rules(
    p_expense_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_household_id UUID;
    v_description TEXT;
    v_merchant TEXT;
    v_category_id UUID;
    v_rule RECORD;
BEGIN
    -- Obtener datos del gasto
    SELECT household_id, description, merchant
    INTO v_household_id, v_description, v_merchant
    FROM expenses WHERE id = p_expense_id;
    
    -- Buscar reglas aplicables (ordenadas por prioridad)
    FOR v_rule IN 
        SELECT * FROM categorization_rules
        WHERE household_id = v_household_id
        AND is_active = true
        ORDER BY priority DESC
    LOOP
        -- Determinar el campo a evaluar
        DECLARE
            v_field_value TEXT;
        BEGIN
            IF v_rule.field = 'merchant' THEN
                v_field_value := v_merchant;
            ELSE
                v_field_value := v_description;
            END IF;
            
            -- Aplicar la regla según el tipo
            IF v_field_value IS NOT NULL THEN
                CASE v_rule.rule_type
                    WHEN 'contains' THEN
                        IF LOWER(v_field_value) LIKE '%' || LOWER(v_rule.pattern) || '%' THEN
                            v_category_id := v_rule.category_id;
                            EXIT;
                        END IF;
                    WHEN 'starts_with' THEN
                        IF LOWER(v_field_value) LIKE LOWER(v_rule.pattern) || '%' THEN
                            v_category_id := v_rule.category_id;
                            EXIT;
                        END IF;
                    WHEN 'exact' THEN
                        IF LOWER(v_field_value) = LOWER(v_rule.pattern) THEN
                            v_category_id := v_rule.category_id;
                            EXIT;
                        END IF;
                    WHEN 'regex' THEN
                        IF v_field_value ~* v_rule.pattern THEN
                            v_category_id := v_rule.category_id;
                            EXIT;
                        END IF;
                END CASE;
            END IF;
        END;
    END LOOP;
    
    -- Si encontró categoría, actualizar el gasto
    IF v_category_id IS NOT NULL THEN
        UPDATE expenses 
        SET category_id = v_category_id,
            is_categorized = true
        WHERE id = p_expense_id;
    END IF;
    
    RETURN v_category_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- FUNCIÓN: copy_budget_from_previous_month
-- Copia presupuesto del mes anterior
-- ========================================
CREATE OR REPLACE FUNCTION copy_budget_from_previous_month(
    p_household_id UUID,
    p_target_month VARCHAR(7)
)
RETURNS UUID AS $$
DECLARE
    v_prev_month VARCHAR(7);
    v_prev_budget_id UUID;
    v_new_budget_id UUID;
BEGIN
    -- Calcular mes anterior
    v_prev_month := to_char(
        (p_target_month || '-01')::date - interval '1 month',
        'YYYY-MM'
    );
    
    -- Obtener budget del mes anterior
    SELECT id INTO v_prev_budget_id
    FROM monthly_budgets
    WHERE household_id = p_household_id
    AND month = v_prev_month;
    
    IF v_prev_budget_id IS NULL THEN
        RAISE EXCEPTION 'No existe presupuesto del mes anterior (%)' , v_prev_month;
    END IF;
    
    -- Crear nuevo budget
    INSERT INTO monthly_budgets (household_id, month, notes)
    VALUES (p_household_id, p_target_month, 'Copiado de ' || v_prev_month)
    RETURNING id INTO v_new_budget_id;
    
    -- Copiar líneas de presupuesto
    INSERT INTO budget_lines (budget_id, category_id, planned_amount, notes)
    SELECT v_new_budget_id, category_id, planned_amount, notes
    FROM budget_lines
    WHERE budget_id = v_prev_budget_id;
    
    -- Copiar ingresos
    INSERT INTO income_items (budget_id, name, amount, is_recurring, source_type, notes)
    SELECT v_new_budget_id, name, amount, is_recurring, source_type, notes
    FROM income_items
    WHERE budget_id = v_prev_budget_id;
    
    RETURN v_new_budget_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- TRIGGER: Crear perfil automáticamente
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ========================================
-- TRIGGER: Auto-categorizar al crear gasto
-- ========================================
CREATE OR REPLACE FUNCTION auto_categorize_expense()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo si no tiene categoría
    IF NEW.category_id IS NULL THEN
        PERFORM apply_categorization_rules(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER expense_auto_categorize
    AFTER INSERT ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION auto_categorize_expense();


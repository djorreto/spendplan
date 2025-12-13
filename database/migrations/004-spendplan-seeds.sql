-- ========================================
-- 🌱 SPENDPLAN - SEEDS (Datos iniciales)
-- ========================================
-- Categorías por defecto y configuración inicial

-- ========================================
-- CATEGORÍAS GLOBALES (Sistema)
-- ========================================
INSERT INTO categories (id, household_id, name, icon, color, is_system, sort_order) VALUES
    -- Esenciales
    ('00000000-0000-0000-0000-000000000001', NULL, 'Supermercado', 'shopping-cart', '#22c55e', true, 1),
    ('00000000-0000-0000-0000-000000000002', NULL, 'Servicios', 'zap', '#f59e0b', true, 2),
    ('00000000-0000-0000-0000-000000000003', NULL, 'Transporte', 'car', '#3b82f6', true, 3),
    ('00000000-0000-0000-0000-000000000004', NULL, 'Salud', 'heart-pulse', '#ef4444', true, 4),
    
    -- Vivienda
    ('00000000-0000-0000-0000-000000000005', NULL, 'Arriendo/Hipoteca', 'home', '#8b5cf6', true, 5),
    ('00000000-0000-0000-0000-000000000006', NULL, 'Hogar', 'lamp', '#06b6d4', true, 6),
    ('00000000-0000-0000-0000-000000000007', NULL, 'Seguros', 'shield', '#64748b', true, 7),
    
    -- Estilo de vida
    ('00000000-0000-0000-0000-000000000008', NULL, 'Ocio', 'gamepad-2', '#ec4899', true, 8),
    ('00000000-0000-0000-0000-000000000009', NULL, 'Restaurantes', 'utensils', '#f97316', true, 9),
    ('00000000-0000-0000-0000-000000000010', NULL, 'Suscripciones', 'repeat', '#a855f7', true, 10),
    
    -- Otros
    ('00000000-0000-0000-0000-000000000011', NULL, 'Educación', 'graduation-cap', '#14b8a6', true, 11),
    ('00000000-0000-0000-0000-000000000012', NULL, 'Auto', 'fuel', '#84cc16', true, 12),
    ('00000000-0000-0000-0000-000000000013', NULL, 'Mascotas', 'dog', '#f472b6', true, 13),
    ('00000000-0000-0000-0000-000000000014', NULL, 'Regalos', 'gift', '#fb923c', true, 14),
    ('00000000-0000-0000-0000-000000000015', NULL, 'Deudas', 'credit-card', '#dc2626', true, 15),
    ('00000000-0000-0000-0000-000000000016', NULL, 'Otros', 'more-horizontal', '#94a3b8', true, 99)
ON CONFLICT DO NOTHING;

-- ========================================
-- CONFIGURACIÓN AI DEFAULT (Mock provider)
-- ========================================
INSERT INTO ai_configs (id, household_id, provider, is_active, settings)
VALUES (
    '00000000-0000-0000-0000-000000000100',
    NULL,  -- Global default
    'mock',
    true,
    '{
        "model": "mock-v1",
        "max_tokens": 500,
        "temperature": 0.7
    }'::jsonb
)
ON CONFLICT DO NOTHING;

-- ========================================
-- STORAGE BUCKETS (ejecutar en Supabase Dashboard)
-- ========================================
-- Crear manualmente estos buckets en Supabase Storage:
-- 
-- 1. receipts (privado)
--    - Para boletas y fotos de gastos
--    - Política: Solo miembros del hogar pueden acceder
--
-- 2. imports (privado)
--    - Para archivos CSV importados
--    - Política: Solo miembros del hogar pueden acceder
--
-- 3. avatars (público)
--    - Para fotos de perfil
--    - Política: Cualquiera puede leer, usuarios autenticados escriben

-- ========================================
-- STORAGE POLICIES (SQL para Storage)
-- ========================================
-- Ejecutar en SQL Editor después de crear los buckets:

/*
-- Bucket: receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false);

CREATE POLICY "Household members can access receipts"
ON storage.objects FOR ALL
USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1]::uuid IN (
        SELECT household_id FROM household_memberships WHERE user_id = auth.uid()
    )
);

-- Bucket: imports
INSERT INTO storage.buckets (id, name, public) VALUES ('imports', 'imports', false);

CREATE POLICY "Household members can access imports"
ON storage.objects FOR ALL
USING (
    bucket_id = 'imports'
    AND (storage.foldername(name))[1]::uuid IN (
        SELECT household_id FROM household_memberships WHERE user_id = auth.uid()
    )
);

-- Bucket: avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Anyone can read avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
);
*/

-- ========================================
-- ÍNDICES ADICIONALES PARA PERFORMANCE
-- ========================================
CREATE INDEX IF NOT EXISTS idx_expenses_household_month_category 
    ON expenses(household_id, expense_date, category_id);

CREATE INDEX IF NOT EXISTS idx_expenses_source 
    ON expenses(source);

CREATE INDEX IF NOT EXISTS idx_budget_lines_category 
    ON budget_lines(category_id);

CREATE INDEX IF NOT EXISTS idx_wa_messages_created 
    ON whatsapp_messages(created_at DESC);

-- ========================================
-- COMENTARIOS DE DOCUMENTACIÓN
-- ========================================
COMMENT ON FUNCTION monthly_summary IS 'Devuelve resumen de gastos vs presupuesto por categoría para un mes';
COMMENT ON FUNCTION monthly_totals IS 'Devuelve totales agregados del mes (ingresos, gastos, ahorro)';
COMMENT ON FUNCTION daily_spending IS 'Devuelve gasto diario y acumulado del mes';
COMMENT ON FUNCTION top_merchants IS 'Devuelve los comercios con mayor gasto del mes';
COMMENT ON FUNCTION category_trend IS 'Devuelve tendencia histórica de una categoría';
COMMENT ON FUNCTION apply_categorization_rules IS 'Aplica reglas de categorización automática a un gasto';
COMMENT ON FUNCTION copy_budget_from_previous_month IS 'Copia presupuesto del mes anterior al mes indicado';


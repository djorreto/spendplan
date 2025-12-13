-- ========================================
-- 🌱 SPENDPLAN - DATOS INICIALES (SEEDS)
-- ========================================
-- Categorías por defecto del sistema
-- Ejecutar después del esquema y RLS

-- ========================================
-- CATEGORÍAS DEL SISTEMA (is_system = true)
-- ========================================
INSERT INTO categories (id, household_id, name, icon, color, is_system, sort_order) VALUES
    ('00000000-0000-0000-0000-000000000001', NULL, 'Supermercado', 'shopping-cart', '#22c55e', true, 1),
    ('00000000-0000-0000-0000-000000000002', NULL, 'Servicios', 'zap', '#3b82f6', true, 2),
    ('00000000-0000-0000-0000-000000000003', NULL, 'Transporte', 'car', '#f59e0b', true, 3),
    ('00000000-0000-0000-0000-000000000004', NULL, 'Salud', 'heart', '#ef4444', true, 4),
    ('00000000-0000-0000-0000-000000000005', NULL, 'Deuda/Hipoteca', 'landmark', '#8b5cf6', true, 5),
    ('00000000-0000-0000-0000-000000000006', NULL, 'Seguros', 'shield', '#06b6d4', true, 6),
    ('00000000-0000-0000-0000-000000000007', NULL, 'Ocio', 'gamepad-2', '#ec4899', true, 7),
    ('00000000-0000-0000-0000-000000000008', NULL, 'Educación', 'graduation-cap', '#14b8a6', true, 8),
    ('00000000-0000-0000-0000-000000000009', NULL, 'Hogar', 'home', '#f97316', true, 9),
    ('00000000-0000-0000-0000-000000000010', NULL, 'Auto', 'car', '#84cc16', true, 10),
    ('00000000-0000-0000-0000-000000000011', NULL, 'Suscripciones', 'repeat', '#a855f7', true, 11),
    ('00000000-0000-0000-0000-000000000012', NULL, 'Restaurantes', 'utensils', '#f43f5e', true, 12),
    ('00000000-0000-0000-0000-000000000013', NULL, 'Mascotas', 'dog', '#10b981', true, 13),
    ('00000000-0000-0000-0000-000000000014', NULL, 'Ropa', 'shirt', '#6366f1', true, 14),
    ('00000000-0000-0000-0000-000000000015', NULL, 'Regalos', 'gift', '#d946ef', true, 15),
    ('00000000-0000-0000-0000-000000000016', NULL, 'Viajes', 'plane', '#0ea5e9', true, 16),
    ('00000000-0000-0000-0000-000000000017', NULL, 'Sin clasificar', 'help-circle', '#9ca3af', true, 99)
ON CONFLICT DO NOTHING;

-- ========================================
-- STORAGE BUCKETS
-- ========================================
-- Ejecutar en Supabase Dashboard > Storage o via API

/*
-- Bucket para boletas/recibos (privado)
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false);

-- Bucket para avatares (público)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- Políticas de Storage para receipts
CREATE POLICY "Members can view receipts"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'receipts' 
    AND auth.is_household_member((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Members can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'receipts' 
    AND auth.is_household_member((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Members can delete receipts"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'receipts' 
    AND auth.is_household_member((storage.foldername(name))[1]::uuid)
);
*/

-- ========================================
-- CATEGORIZACIÓN RULES EJEMPLO (opcional)
-- ========================================
-- Estas son reglas de ejemplo que se pueden crear por hogar

/*
-- Ejemplo de reglas comunes (descomentar si se quiere crear para un hogar específico):
INSERT INTO categorization_rules (household_id, category_id, rule_type, pattern, priority) VALUES
    -- Supermercado
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000001', 'contains', 'JUMBO', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000001', 'contains', 'LIDER', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000001', 'contains', 'SANTA ISABEL', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000001', 'contains', 'UNIMARC', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000001', 'contains', 'TOTTUS', 10),
    -- Servicios
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000002', 'contains', 'ENEL', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000002', 'contains', 'AGUAS ANDINAS', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000002', 'contains', 'METROGAS', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000002', 'contains', 'VTR', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000002', 'contains', 'MOVISTAR', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000002', 'contains', 'ENTEL', 10),
    -- Transporte
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000003', 'contains', 'COPEC', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000003', 'contains', 'SHELL', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000003', 'contains', 'UBER', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000003', 'contains', 'CABIFY', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000003', 'contains', 'BIP', 10),
    -- Suscripciones
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000011', 'contains', 'NETFLIX', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000011', 'contains', 'SPOTIFY', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000011', 'contains', 'DISNEY', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000011', 'contains', 'HBO', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000011', 'contains', 'AMAZON PRIME', 10),
    -- Restaurantes
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000012', 'contains', 'RAPPI', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000012', 'contains', 'UBER EATS', 10),
    ('TU_HOUSEHOLD_ID', '00000000-0000-0000-0000-000000000012', 'contains', 'PEDIDOS YA', 10);
*/


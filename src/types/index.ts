/**
 * ========================================
 * 📋 SPENDPLAN - TIPOS TYPESCRIPT
 * ========================================
 */

// ========================================
// Enums
// ========================================
export type MembershipRole = 'owner' | 'member'
export type PaymentMethod = 'cash' | 'debit' | 'credit' | 'transfer' | 'unknown'
export type ExpenseStatus = 'confirmed' | 'pending' | 'cancelled'
export type ExpenseSource = 'manual' | 'whatsapp' | 'csv_import' | 'api'
export type TransactionStatus = 'unreconciled' | 'reconciled' | 'ignored'
export type AIRequestType = 'categorize' | 'insights' | 'ocr' | 'parse_message'

// ========================================
// Base Entity
// ========================================
export interface BaseEntity {
  id: string
  created_at: string
  updated_at: string
}

// ========================================
// Usuario
// ========================================
export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  preferred_currency: string
  onboarding_completed: boolean
  is_super_admin?: boolean
  created_at: string
  updated_at: string
  telegram_connected?: boolean | null
  telegram_reminder_dismissed_at?: string | null
}

// ========================================
// Hogar
// ========================================
export interface Household extends BaseEntity {
  name: string
  currency: string
  timezone: string
  whatsapp_phone_number: string | null
  whatsapp_verified: boolean
  settings: HouseholdSettings
}

export interface HouseholdSettings {
  theme?: 'light' | 'dark' | 'system'
  notifications?: boolean
  csv_date_format?: string
  csv_amount_column?: string
  // Meta de ahorro mensual (se guarda como número decimal)
  savings_goal?: number
}

// ========================================
// Membresía
// ========================================
export interface HouseholdMembership extends BaseEntity {
  household_id: string
  user_id: string
  role: MembershipRole
  invited_by: string | null
  invited_at: string | null
  joined_at: string
  is_active: boolean
  // Joined
  profile?: Profile
  household?: Household
}

// ========================================
// Categoría
// ========================================
export interface Category {
  id: string
  household_id: string | null
  name: string
  icon: string | null
  color: string | null
  is_system: boolean
  parent_id: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// ========================================
// Presupuesto Mensual
// ========================================
export interface MonthlyBudget extends BaseEntity {
  household_id: string
  month: string // YYYY-MM
  notes: string | null
  is_locked: boolean
  created_by: string | null
  // Computed/Joined
  budget_lines?: BudgetLine[]
  income_items?: IncomeItem[]
  total_income?: number
  total_budgeted?: number
}

export interface BudgetLine {
  id: string
  budget_id: string
  category_id: string
  amount: number
  notes: string | null
  created_at: string
  updated_at: string
  // Joined
  category?: Category
}

export interface IncomeItem {
  id: string
  budget_id: string
  name: string
  amount: number
  is_recurring: boolean
  source: string | null
  user_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ========================================
// Gasto
// ========================================
export interface Expense extends BaseEntity {
  household_id: string
  category_id: string | null
  amount: number
  description: string | null
  merchant: string | null
  expense_date: string
  payment_method: PaymentMethod
  account: string | null
  status: ExpenseStatus
  source: ExpenseSource
  tags: string[] | null
  notes: string | null
  ai_category_suggestion: string | null
  ai_confidence: number
  ai_reason: string | null
  created_by: string | null
  updated_by: string | null
  // Joined
  category?: Category
  created_by_profile?: Profile
  attachments?: ExpenseAttachment[]
}

export interface ExpenseAttachment {
  id: string
  expense_id: string
  file_path: string
  file_name: string | null
  file_type: string | null
  file_size: number | null
  ocr_text: string | null
  ocr_extracted_data: Record<string, unknown> | null
  created_at: string
}

// ========================================
// Transacciones Bancarias
// ========================================
export interface BankTransaction extends BaseEntity {
  household_id: string
  import_batch_id: string | null
  transaction_date: string
  amount: number
  description: string | null
  reference: string | null
  account: string | null
  bank_name: string | null
  status: TransactionStatus
  raw_data: Record<string, unknown> | null
  imported_by: string | null
  // Joined
  reconciliation_links?: ReconciliationLink[]
}

export interface ReconciliationLink {
  id: string
  bank_transaction_id: string
  expense_id: string
  match_confidence: number | null
  match_reason: string | null
  created_by: string | null
  created_at: string
  // Joined
  expense?: Expense
  bank_transaction?: BankTransaction
}

// ========================================
// Reglas de Categorización
// ========================================
export interface CategorizationRule extends BaseEntity {
  household_id: string
  category_id: string
  rule_type: 'contains' | 'exact' | 'regex' | 'starts_with'
  pattern: string
  is_case_sensitive: boolean
  priority: number
  is_active: boolean
  created_by: string | null
  // Joined
  category?: Category
}

// ========================================
// Configuración AI
// ========================================
export interface AIConfig {
  id: string
  household_id: string
  provider: string
  api_key_ref: string | null
  model: string | null
  settings: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AILog {
  id: string
  household_id: string
  request_type: AIRequestType
  provider: string | null
  model: string | null
  input_data: Record<string, unknown> | null
  output_data: Record<string, unknown> | null
  tokens_used: number | null
  latency_ms: number | null
  success: boolean
  error_message: string | null
  created_at: string
}

// ========================================
// WhatsApp Messages
// ========================================
export interface WhatsAppMessageIn {
  id: string
  household_id: string | null
  from_number: string
  message_id: string | null
  message_type: string | null
  content: string | null
  media_url: string | null
  media_id: string | null
  parsed_data: Record<string, unknown> | null
  expense_id: string | null
  processed: boolean
  created_at: string
}

export interface WhatsAppMessageOut {
  id: string
  household_id: string | null
  to_number: string
  message_id: string | null
  content: string
  status: string
  related_expense_id: string | null
  created_at: string
}

// ========================================
// Insights
// ========================================
export interface InsightsReport {
  id: string
  household_id: string
  month: string
  insights: InsightsData
  recommended_budget: RecommendedBudget | null
  ai_provider: string | null
  generated_at: string
  created_at: string
}

export interface InsightsData {
  bullets: string[]
  flags: InsightFlag[]
  recommendations: string[]
}

export interface InsightFlag {
  category_id: string
  category_name: string
  type: 'over_budget' | 'trending_up' | 'unusual'
  message: string
  percentage?: number
}

export interface RecommendedBudget {
  lines: {
    category_id: string
    amount: number
    reason: string
  }[]
}

// ========================================
// Invitaciones
// ========================================
export interface HouseholdInvitation {
  id: string
  household_id: string
  email: string
  role: MembershipRole
  token: string
  invited_by: string
  expires_at: string
  accepted_at: string | null
  created_at: string
  // Joined
  household?: Household
  inviter?: Profile
}

// ========================================
// Resumen Mensual (de la función SQL)
// ========================================
export interface MonthlySummaryLine {
  category_id: string
  category_name: string
  budgeted: number
  spent: number
  difference: number
  percentage: number
}

export interface MonthlyTotals {
  total_income: number
  total_budgeted: number
  total_spent: number
  available: number
  budget_used_percentage: number
}

// ========================================
// Forms
// ========================================
export interface ExpenseFormData {
  amount: number
  description?: string
  merchant?: string
  expense_date: string
  payment_method: PaymentMethod
  category_id?: string
  account?: string
  tags?: string[]
  notes?: string
}

export interface BudgetFormData {
  month: string
  income_items: {
    name: string
    amount: number
    source?: string
    is_recurring: boolean
  }[]
  budget_lines: {
    category_id: string
    amount: number
  }[]
}

// ========================================
// API Responses
// ========================================
export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

// ========================================
// AI Provider Types
// ========================================
export interface AICategorizeInput {
  description: string
  merchant?: string
  amount: number
  categories: Category[]
  rules: CategorizationRule[]
  recent_expenses?: Expense[]
}

export interface AICategorizeOutput {
  category_id: string
  confidence: number
  reason: string
}

export interface AIInsightsInput {
  month: string
  expenses: Expense[]
  budget: MonthlyBudget | null
  categories: Category[]
  previous_months?: {
    month: string
    total_spent: number
    by_category: Record<string, number>
  }[]
}

export interface AIInsightsOutput {
  bullets: string[]
  flags: InsightFlag[]
  recommendations: string[]
  recommended_budget?: RecommendedBudget
}

// ========================================
// Dashboard Stats
// ========================================
export interface DashboardStats {
  total_spent: number
  total_income: number
  available: number
  budget_used_percentage: number
  expenses_count: number
  top_categories: {
    category: Category
    amount: number
    percentage: number
  }[]
  top_merchants: {
    merchant: string
    amount: number
    count: number
  }[]
  daily_spending: {
    date: string
    amount: number
    cumulative: number
  }[]
  over_budget_categories: {
    category: Category
    budgeted: number
    spent: number
    over_by: number
  }[]
}

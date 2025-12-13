/**
 * ========================================
 * 🤖 SPENDPLAN - AI PROVIDER TYPES
 * ========================================
 */

import type { Category, CategorizationRule, Expense, InsightFlag, RecommendedBudget } from '@/types'

// ========================================
// Input Types
// ========================================

export interface CategorizeInput {
  description: string
  merchant?: string
  amount: number
  categories: Pick<Category, 'id' | 'name' | 'icon'>[]
  rules: Pick<CategorizationRule, 'category_id' | 'rule_type' | 'pattern'>[]
  recentExpenses?: Pick<Expense, 'description' | 'merchant' | 'category_id'>[]
}

export interface InsightsInput {
  month: string
  currency: string
  expenses: Array<{
    amount: number
    category_id: string | null
    category_name: string | null
    merchant: string | null
    expense_date: string
  }>
  categories: Pick<Category, 'id' | 'name'>[]
  budget: {
    total_income: number
    total_budgeted: number
    lines: Array<{
      category_id: string
      category_name: string
      amount: number
    }>
  } | null
  previousMonths?: Array<{
    month: string
    total_spent: number
    by_category: Record<string, number>
  }>
}

export interface OCRInput {
  imageBase64: string
  mimeType: string
}

export interface ParseMessageInput {
  message: string
  categories: Pick<Category, 'id' | 'name'>[]
}

// ========================================
// Output Types
// ========================================

export interface CategorizeOutput {
  category_id: string | null
  confidence: number
  reason: string
}

export interface InsightsOutput {
  bullets: string[]
  flags: InsightFlag[]
  recommendations: string[]
  recommendedBudget?: RecommendedBudget
}

export interface OCROutput {
  amount: number | null
  date: string | null
  merchant: string | null
  description: string | null
  raw_text: string
  confidence: number
}

export interface ParseMessageOutput {
  amount: number | null
  merchant: string | null
  description: string | null
  category_id: string | null
  payment_method: string | null
  confidence: number
}

// ========================================
// Provider Interface
// ========================================

export interface AIProvider {
  name: string
  
  categorize(input: CategorizeInput): Promise<CategorizeOutput>
  
  generateInsights(input: InsightsInput): Promise<InsightsOutput>
  
  extractFromImage(input: OCRInput): Promise<OCROutput>
  
  parseMessage(input: ParseMessageInput): Promise<ParseMessageOutput>
}

// ========================================
// Provider Config
// ========================================

export interface AIProviderConfig {
  provider: string
  apiKey?: string
  model?: string
  settings?: Record<string, unknown>
}


'use client'

import { redirect } from 'next/navigation'

// Redirect to expenses page - the dialog handles new expense
export default function NewExpensePage() {
  redirect('/app/expenses')
}


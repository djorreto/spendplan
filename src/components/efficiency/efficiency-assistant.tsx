'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  EFFICIENCY_TOPIC_META,
  getEfficiencyPlaybook,
  type EfficiencyTopic,
} from '@/lib/efficiency-playbooks'
import type { EfficiencyHouseholdContext } from '@/lib/efficiency-context'
import { Loader2, Send, Sparkles, User } from 'lucide-react'

type ChatTurn = { role: 'user' | 'assistant'; content: string }

export function EfficiencyAssistant({
  open,
  topic,
  context,
  onTopicChange,
  onClose,
}: {
  open: boolean
  topic: EfficiencyTopic
  context: Omit<EfficiencyHouseholdContext, 'topic'>
  onTopicChange: (topic: EfficiencyTopic) => void
  onClose: () => void
}) {
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const startedFor = useRef<string | null>(null)

  const meta = EFFICIENCY_TOPIC_META.find((item) => item.id === topic)
  const playbook = getEfficiencyPlaybook(topic)
  const payload: EfficiencyHouseholdContext = { ...context, topic }

  useEffect(() => {
    if (!open) {
      startedFor.current = null
      return
    }
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  useEffect(() => {
    if (!open) return
    const key = `${topic}-${context.month}`
    if (startedFor.current === key) return
    startedFor.current = key
    setMessages([])
    setSuggestions([])
    setError(null)
    void ask('__start__', [])
  }, [open, topic, context.month])

  async function ask(text: string, history: ChatTurn[]) {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/ai/efficiency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          context: payload,
          topic,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No pude armar la recomendación')
      const reply = String(data.message || '').trim()
      setMessages((current) => [...current, { role: 'assistant', content: reply }])
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al consultar')
    } finally {
      setLoading(false)
    }
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    const userTurn: ChatTurn = { role: 'user', content: trimmed }
    const nextHistory = [...messages, userTurn]
    setMessages(nextHistory)
    setInput('')
    setSuggestions([])
    await ask(trimmed, nextHistory)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-700" />
            Asistente de eficiencias
          </DialogTitle>
          <DialogDescription>
            {meta?.blurb || 'Bajar este gasto con datos del hogar y del mercado chileno.'} Mercado al{' '}
            {playbook.marketUpdated}.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-3 flex gap-2 overflow-x-auto">
          {EFFICIENCY_TOPIC_META.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onTopicChange(item.id)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs',
                topic === item.id
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'hover:bg-muted'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="px-5 overflow-y-auto space-y-3 border-t border-b py-4 flex-1 min-h-0">
          {messages.map((turn, index) => (
            <div
              key={`${turn.role}-${index}`}
              className={cn('flex gap-2', turn.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {turn.role === 'assistant' ? (
                <div className="h-7 w-7 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
                </div>
              ) : null}
              <div
                className={cn(
                  'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
                  turn.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                )}
              >
                {turn.content}
              </div>
              {turn.role === 'user' ? (
                <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
              ) : null}
            </div>
          ))}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Estoy cruzando tus boletas con el mercado…
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div ref={bottomRef} />
        </div>

        <div className="p-4 space-y-3">
          {suggestions.length > 0 && !loading ? (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => void send(item)}
                  className="rounded-full border px-3 py-1 text-xs hover:bg-muted text-left"
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void send(input)
            }}
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ej: somos 4, no usamos el cable, hay fibra en el edificio"
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

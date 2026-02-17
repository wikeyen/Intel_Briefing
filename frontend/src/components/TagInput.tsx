// ABOUTME: Reusable tag-input component for managing lists of string values.
// ABOUTME: Supports add-on-enter, remove-on-click, and optional placeholder text.
import { useState } from 'react'
import type { KeyboardEvent } from 'react'

interface Props {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  validate?: (value: string) => string | null
}

export function TagInput({ tags, onChange, placeholder = 'Add…', validate }: Props) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = () => {
    const val = input.trim()
    if (!val) return
    if (validate) {
      const err = validate(val)
      if (err) { setError(err); return }
    }
    if (!tags.includes(val)) onChange([...tags, val])
    setInput('')
    setError(null)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); add() }
    if (e.key === 'Backspace' && !input && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 bg-indigo-700 text-white text-xs px-2 py-1 rounded"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="hover:text-red-300 leading-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => { setInput(e.target.value); setError(null) }}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
      />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}

'use client'

import { useChat } from 'ai/react'

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat()

  return (
    <div>
      <div>
        {messages.map(m => (
          <div key={m.id}>
            <p><strong>{m.role === 'user' ? 'You: ' : 'AI: '}</strong>{m.content}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask about Selfhood..."
        />
        <button type="submit">
          Send
        </button>
      </form>
    </div>
  )
}
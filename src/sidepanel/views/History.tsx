import type { Conversation } from '../../lib/store'
import { TrashIcon } from '../icons'

export function HistoryView({
  conversations,
  activeId,
  onOpen,
  onDelete,
}: {
  conversations: Conversation[]
  activeId: string | null
  onOpen: (c: Conversation) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="view view--history">
      <h2 className="view__title">History</h2>
      {conversations.length === 0 ? (
        <p className="muted-copy">No conversations yet. Start one with the + button.</p>
      ) : (
        <ul className="hist">
          {conversations.map((c) => (
            <li key={c.id} className={`hist__item${c.id === activeId ? ' hist__item--active' : ''}`}>
              <button className="hist__open" onClick={() => onOpen(c)}>
                <span className="hist__title">{c.title || 'Untitled'}</span>
                <span className="hist__meta">
                  {c.messages.length} msgs · {timeAgo(c.updatedAt)}
                </span>
              </button>
              <button className="hist__del" aria-label="delete" onClick={() => onDelete(c.id)}>
                <TrashIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

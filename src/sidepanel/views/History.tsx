import type { Conversation } from '../../lib/store'
import { useT, type T } from '../../lib/i18n'
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
  const t = useT()
  return (
    <div className="view view--history">
      <h2 className="view__title">{t('history.title')}</h2>
      {conversations.length === 0 ? (
        <p className="muted-copy">{t('history.empty')}</p>
      ) : (
        <ul className="hist">
          {conversations.map((c) => (
            <li key={c.id} className={`hist__item${c.id === activeId ? ' hist__item--active' : ''}`}>
              <button className="hist__open" onClick={() => onOpen(c)}>
                <span className="hist__title">{c.title || t('history.untitled')}</span>
                <span className="hist__meta">
                  {t('history.msgs', c.messages.length as never)} · {timeAgo(t, c.updatedAt)}
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

function timeAgo(t: T, ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return t('time.justNow')
  if (s < 3600) return t('time.mAgo', Math.floor(s / 60) as never)
  if (s < 86400) return t('time.hAgo', Math.floor(s / 3600) as never)
  return t('time.dAgo', Math.floor(s / 86400) as never)
}

// Wraps bare http(s):// URLs in a string with clickable <a> tags. Shared across
// Chat, Checklist, and Kanban so plain-text fields get consistent link detection.
export default function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>'"]+)/g)
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part)
          ? <a key={i} href={part} target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'underline', wordBreak: 'break-all' }}>
              {part}
            </a>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

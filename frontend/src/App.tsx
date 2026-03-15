import { useState } from 'react'
import { UploadPage } from '@/pages/UploadPage'
import { EditorPage } from '@/pages/EditorPage'
import type { Session } from '@/types'

const SESSION_KEY = 'mapforge_session'

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  const handleSession = (s: Session) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
    setSession(s)
  }

  const handleClose = () => {
    sessionStorage.removeItem(SESSION_KEY)
    setSession(null)
  }

  if (!session) {
    return <UploadPage onSession={handleSession} />
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <EditorPage session={session} onClose={handleClose} />
    </div>
  )
}

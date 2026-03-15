import { useState } from 'react'
import { UploadPage } from '@/pages/UploadPage'
import { EditorPage } from '@/pages/EditorPage'
import type { Session } from '@/types'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)

  if (!session) {
    return <UploadPage onSession={setSession} />
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <EditorPage session={session} onClose={() => setSession(null)} />
    </div>
  )
}

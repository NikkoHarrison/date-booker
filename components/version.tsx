"use client"

import { useEffect, useState } from "react"

export function Version() {
  const [version, setVersion] = useState<string>("")

  useEffect(() => {
    // Get the commit hash from the environment variable
    const commitHash = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "local"
    setVersion(commitHash.slice(0, 7)) // Show only first 7 characters
  }, [])

  return (
    <div className="fixed bottom-2 right-2 text-xs text-gray-500">
      v{version}
    </div>
  )
} 
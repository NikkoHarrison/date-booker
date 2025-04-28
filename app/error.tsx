"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Error caught by error boundary:", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
      <div className="bg-red-50 border border-red-200 rounded p-4 mb-4 max-w-lg">
        <p className="text-red-700 mb-2">Error: {error.message}</p>
        {error.stack && (
          <pre className="text-xs text-left overflow-auto max-h-40 bg-white p-2 rounded">{error.stack}</pre>
        )}
      </div>
      <div className="flex gap-4">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/debug")}>
          Go to Debug Page
        </Button>
      </div>
    </div>
  )
}

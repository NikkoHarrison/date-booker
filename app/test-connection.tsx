"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function TestConnection() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function testConnection() {
      try {
        // Try to fetch a single row from instances table
        const { data, error } = await supabase
          .from("instances")
          .select("*")
          .limit(1)

        if (error) {
          throw error
        }

        setStatus("success")
      } catch (err) {
        console.error("Supabase connection error:", err)
        setStatus("error")
        setError(err instanceof Error ? err.message : "Unknown error occurred")
      }
    }

    testConnection()
  }, [])

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Supabase Connection Test</h1>
      <div className="p-4 rounded-lg border">
        {status === "loading" && (
          <div className="text-blue-500">Testing connection...</div>
        )}
        {status === "success" && (
          <div className="text-green-500">✅ Successfully connected to Supabase!</div>
        )}
        {status === "error" && (
          <div className="text-red-500">
            ❌ Failed to connect to Supabase: {error}
          </div>
        )}
      </div>
    </div>
  )
} 
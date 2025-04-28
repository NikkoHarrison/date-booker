"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function DebugPage() {
  const [users, setUsers] = useState<any[]>([])
  const [availability, setAvailability] = useState<any[]>([])
  const [favorites, setFavorites] = useState<any[]>([])
  const [responses, setResponses] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weekdays, setWeekdays] = useState<Date[]>([])

  // Generate all weekdays in May 2025
  useEffect(() => {
    const dates: Date[] = []
    const year = 2025
    const month = 4 // May is 4 in JavaScript (0-indexed)

    // Get all days in May 2025
    const date = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0).getDate()

    for (let day = 1; day <= lastDay; day++) {
      date.setDate(day)
      const dayOfWeek = date.getDay()

      // Only include weekdays (Monday-Friday: 1-5)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        dates.push(new Date(year, month, day))
      }
    }

    setWeekdays(dates)
    console.log(
      "Weekdays:",
      dates.map((d) => d.toISOString()),
    )
  }, [])

  // Load data from Supabase
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      setError(null)

      try {
        // Load users
        const { data: usersData, error: usersError } = await supabase.from("users").select("*")
        if (usersError) throw usersError
        setUsers(usersData || [])

        // Load availability
        const { data: availabilityData, error: availabilityError } = await supabase.from("availability").select("*")
        if (availabilityError) throw availabilityError
        setAvailability(availabilityData || [])

        // Load favorites
        const { data: favoritesData, error: favoritesError } = await supabase.from("favorites").select("*")
        if (favoritesError) throw favoritesError
        setFavorites(favoritesData || [])

        // Load responses
        const { data: responsesData, error: responsesError } = await supabase.from("responses").select("*")
        if (responsesError) throw responsesError
        setResponses(responsesData || [])
      } catch (err: any) {
        console.error("Error loading data:", err)
        setError(err.message || "Failed to load data")
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  // Function to check if a user is available on a specific date
  const isUserAvailable = (userId: number, dateKey: string) => {
    return availability.some((a) => a.user_id === userId && a.date_key === dateKey && a.is_available)
  }

  // Function to check if a date is a favorite for a user
  const isDateFavorite = (userId: number, dateKey: string) => {
    return favorites.some((f) => f.user_id === userId && f.date_key === dateKey && f.is_favorite)
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Debug Page</h1>

      {error && (
        <Alert className="mb-4 bg-red-50 border-red-200">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div>Loading data...</div>
      ) : (
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold mb-2">Users ({users.length})</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-60">{JSON.stringify(users, null, 2)}</pre>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Availability Records ({availability.length})</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-60">
              {JSON.stringify(availability, null, 2)}
            </pre>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Favorites Records ({favorites.length})</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-60">{JSON.stringify(favorites, null, 2)}</pre>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Responses Records ({responses.length})</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-60">{JSON.stringify(responses, null, 2)}</pre>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Weekdays in May 2025</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {weekdays.map((date) => {
                const dateKey = date.toISOString()
                return (
                  <div key={dateKey} className="border p-4 rounded">
                    <div className="font-medium">
                      {date.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}
                    </div>
                    <div className="text-sm text-gray-500">ISO: {dateKey}</div>
                    <div className="mt-2">
                      <h3 className="font-medium">Available Users:</h3>
                      <ul className="list-disc pl-5">
                        {users
                          .filter((user) => isUserAvailable(user.id, dateKey))
                          .map((user) => (
                            <li key={user.id}>
                              {user.name} {isDateFavorite(user.id, dateKey) && "⭐"}
                            </li>
                          ))}
                      </ul>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="mt-8">
        <Button onClick={() => (window.location.href = "/")}>Back to Main Page</Button>
      </div>
    </div>
  )
}

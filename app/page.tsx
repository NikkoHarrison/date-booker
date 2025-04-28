"use client"

import { useState, useRef, useEffect } from "react"
import { Star, Users, PlusCircle, MinusCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useMobile } from "@/hooks/use-mobile"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  supabase,
  type User,
  type AvailabilityRecord,
  type FavoriteRecord,
  type MessageRecord,
  type ResponseRecord,
} from "@/lib/supabase"
import { toast } from "@/hooks/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { checkDatabaseSchema } from "@/lib/debug-schema"

// Define message type
interface ChatMessage {
  id: string
  sender: string
  senderId: number
  text: string
  timestamp: Date
}

// Define participant type with ID
interface Participant {
  id: number
  name: string
}

// Create a client-only component for the dialog
function UserSelectionDialog({
  isOpen,
  participants,
  selectedUserId,
  isLoading,
  onUserSelect,
  getAvatarColor,
  getInitials,
  getSortedParticipants,
}: {
  isOpen: boolean
  participants: Participant[]
  selectedUserId: number | null
  isLoading: boolean
  onUserSelect: (userId: number) => void
  getAvatarColor: (name: string) => string
  getInitials: (name: string) => string
  getSortedParticipants: (users: Participant[], selectedUserId: number | null) => Participant[]
}) {
  // Use state to track if component is mounted
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Don't render anything during SSR or before hydration
  if (!isMounted) return null

  return (
    <div
      className={`fixed inset-0 bg-black/50 z-50 flex items-center justify-center transition-opacity duration-200 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="text-center text-2xl font-semibold mb-2">Vem är du?</h2>
          <p className="text-center text-gray-500 mb-6">Välj ditt namn för att markera dina tillgängliga dagar</p>
          <div className="grid grid-cols-1 gap-4 py-4">
            {getSortedParticipants(participants, selectedUserId).map((participant) => (
              <Button
                key={participant.id}
                variant="outline"
                className="flex items-center justify-start gap-3 h-14 px-4"
                onClick={() => onUserSelect(participant.id)}
                disabled={isLoading}
              >
                <Avatar className={`h-8 w-8 ${getAvatarColor(participant.name)}`}>
                  <AvatarFallback>{getInitials(participant.name)}</AvatarFallback>
                </Avatar>
                <span className="text-lg">{participant.name}</span>
                {participant.id === selectedUserId && (
                  <span className="ml-auto text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">Nuvarande</span>
                )}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AfterWorkPlanner() {
  // Generate all weekdays in May 2025 - moved outside of component body to prevent re-creation on each render
  const weekdays = (() => {
    const dates = []
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

    return dates
  })()

  // Debug weekdays
  useEffect(() => {
    console.log(
      "Weekdays array:",
      weekdays.map((d) => d.toISOString()),
    )
  }, [])

  // State for version and participants
  const [version, setVersion] = useState<string>("default")
  const [participants, setParticipants] = useState<Participant[]>([])
  const [userSets, setUserSets] = useState<Record<string, Participant[]>>({
    default: [],
    v2: [],
  })

  // State for loading status
  const [isLoading, setIsLoading] = useState(true)
  const [loadingError, setLoadingError] = useState<string | null>(null)

  // State for user selection
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null)
  const [showUserDialog, setShowUserDialog] = useState(false)

  // State to track if component is hydrated
  const [isHydrated, setIsHydrated] = useState(false)

  // State for chat
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // State for responses
  const [responses, setResponses] = useState<Record<number, { hasResponded: boolean; cantAttend: boolean }>>({})

  // Initialize availability state with all false values
  const [availability, setAvailability] = useState<Record<number, Record<string, boolean>>>({})

  // Initialize favored days state with all false values
  const [favoredDays, setFavoredDays] = useState<Record<number, Record<string, boolean>>>({})

  // Add this useEffect to detect URL parameters after the component mounts
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search)
      const versionParam = urlParams.get("version")
      if (versionParam) {
        setVersion(versionParam)
      }
    }
  }, []) // Empty dependency array means this runs once on mount

  // Initialize state objects when participants change
  useEffect(() => {
    // Skip initialization if we're still loading data from the server
    if (isLoading) return

    const newAvailability: Record<number, Record<string, boolean>> = {}
    const newFavoredDays: Record<number, Record<string, boolean>> = {}
    const newResponses: Record<number, { hasResponded: boolean; cantAttend: boolean }> = {}

    // Initialize state for each participant
    participants.forEach((participant) => {
      newAvailability[participant.id] = {}
      newFavoredDays[participant.id] = {}
      newResponses[participant.id] = { hasResponded: false, cantAttend: false }

      weekdays.forEach((date) => {
        const dateKey = date.toISOString()
        newAvailability[participant.id][dateKey] = false
        newFavoredDays[participant.id][dateKey] = false
      })
    })

    setAvailability(newAvailability)
    setFavoredDays(newFavoredDays)
    setResponses(newResponses)
  }, [participants, isLoading]) // Only run when participants or isLoading changes

  const isMobile = useMobile()

  // Load initial data from Supabase
  useEffect(() => {
    console.log("Starting data loading process...")

    // Test Supabase connection
    const testSupabaseConnection = async () => {
      try {
        console.log("Testing Supabase connection...")
        const { data, error } = await supabase.from("users").select("count").limit(1)

        if (error) {
          console.error("Supabase connection test failed:", error)
          return false
        }

        console.log("Supabase connection successful:", data)
        return true
      } catch (err) {
        console.error("Error testing Supabase connection:", err)
        return false
      }
    }

    const loadInitialData = async () => {
      setIsLoading(true)
      setLoadingError(null)

      try {
        // First test the connection
        const isConnected = await testSupabaseConnection()
        if (!isConnected) {
          throw new Error("Could not connect to Supabase")
        }

        // Check database schema
        console.log("Checking database schema...")
        await checkDatabaseSchema()

        // Load users and group them by version
        console.log("Loading users data...")
        const { data: usersData, error: usersError } = await supabase.from("users").select("*").order("name")

        if (usersError) {
          console.error("Error loading users:", usersError)
          throw usersError
        }

        // Log the users data for debugging
        console.log("Users data:", usersData)

        if (!usersData || usersData.length === 0) {
          console.warn("No users found in the database")
          toast({
            title: "Warning",
            description: "No users found in the database",
            variant: "destructive",
          })
        }

        // Group users by version
        const groupedUsers: Record<string, Participant[]> = {
          default: [],
          v2: [],
        }

        usersData.forEach((user: User) => {
          const userVersion = user.version || "default"
          if (!groupedUsers[userVersion]) {
            groupedUsers[userVersion] = []
          }
          groupedUsers[userVersion].push({
            id: user.id,
            name: user.name,
          })
        })

        // Log the grouped users for debugging
        console.log("Grouped users:", groupedUsers)

        // Set user sets and current participants
        setUserSets(groupedUsers)
        const currentParticipants = groupedUsers[version] || groupedUsers.default || []
        setParticipants(currentParticipants)

        // Log the current participants for debugging
        console.log("Current participants:", currentParticipants)

        if (currentParticipants.length === 0) {
          console.warn("No participants found for the current version:", version)
          toast({
            title: "Warning",
            description: `No participants found for version: ${version}`,
            variant: "destructive",
          })
        }

        // Initialize state objects for the current participant set
        const newAvailability: Record<number, Record<string, boolean>> = {}
        const newFavoredDays: Record<number, Record<string, boolean>> = {}
        const newResponses: Record<number, { hasResponded: boolean; cantAttend: boolean }> = {}

        // Initialize state for each participant
        currentParticipants.forEach((participant) => {
          newAvailability[participant.id] = {}
          newFavoredDays[participant.id] = {}
          newResponses[participant.id] = { hasResponded: false, cantAttend: false }

          weekdays.forEach((date) => {
            const dateKey = date.toISOString()
            newAvailability[participant.id][dateKey] = false
            newFavoredDays[participant.id][dateKey] = false
          })
        })

        // Load availability data
        console.log("Loading availability data...")
        const { data: availabilityData, error: availabilityError } = await supabase.from("availability").select("*")

        if (availabilityError) {
          console.error("Error loading availability:", availabilityError)
          throw availabilityError
        }

        // Update availability state
        availabilityData.forEach((record: AvailabilityRecord) => {
          const participantIds = currentParticipants.map((p) => p.id)
          if (participantIds.includes(record.user_id) && newAvailability[record.user_id]) {
            newAvailability[record.user_id][record.date_key] = record.is_available
          }
        })

        // After loading availability data
        console.log("Availability data:", availabilityData)

        // Load favorites data
        console.log("Loading favorites data...")
        const { data: favoritesData, error: favoritesError } = await supabase.from("favorites").select("*")

        if (favoritesError) {
          console.error("Error loading favorites:", favoritesError)
          throw favoritesError
        }

        // Update favorites state
        favoritesData.forEach((record: FavoriteRecord) => {
          const participantIds = currentParticipants.map((p) => p.id)
          if (participantIds.includes(record.user_id) && newFavoredDays[record.user_id]) {
            newFavoredDays[record.user_id][record.date_key] = record.is_favorite
          }
        })

        // After loading favorites data
        console.log("Favorites data:", favoritesData)

        // Load responses data
        console.log("Loading responses data...")
        const { data: responsesData, error: responsesError } = await supabase.from("responses").select("*")

        if (responsesError) {
          console.error("Error loading responses:", responsesError)
          throw responsesError
        }

        // Update responses state
        responsesData.forEach((record: ResponseRecord) => {
          const participantIds = currentParticipants.map((p) => p.id)
          if (participantIds.includes(record.user_id) && newResponses[record.user_id]) {
            newResponses[record.user_id] = {
              hasResponded: record.has_responded,
              cantAttend: record.cant_attend,
            }
          }
        })

        // After loading responses data
        console.log("Responses data:", responsesData)

        // Load messages
        console.log("Loading messages data...")
        const { data: messagesData, error: messagesError } = await supabase
          .from("messages")
          .select("*")
          .order("timestamp", { ascending: true })

        if (messagesError) {
          console.error("Error loading messages:", messagesError)
          throw messagesError
        }

        // After loading messages data
        console.log("Messages data:", messagesData)

        // Create a map of user IDs to names for message display
        const userIdToName = usersData.reduce((acc: Record<number, string>, user: User) => {
          acc[user.id] = user.name
          return acc
        }, {})

        // Update messages state
        const chatMessages: ChatMessage[] = messagesData.map((record: MessageRecord) => ({
          id: record.id.toString(),
          sender: userIdToName[record.user_id] || "Unknown",
          senderId: record.user_id,
          text: record.text,
          timestamp: new Date(record.timestamp),
        }))
        setMessages(chatMessages)

        // Set state
        setAvailability(newAvailability)
        setFavoredDays(newFavoredDays)
        setResponses(newResponses)

        // After processing all data
        console.log("Final state:", {
          availability: newAvailability,
          favoredDays: newFavoredDays,
          responses: newResponses,
          messages: chatMessages,
        })

        console.log("Data loading completed successfully")
      } catch (error) {
        console.error("Error loading data:", error)
        setLoadingError(error instanceof Error ? error.message : "Unknown error loading data")
        toast({
          title: "Error",
          description: "Failed to load data. Please try again.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
        // After data is loaded, show the dialog
        setShowUserDialog(true)
      }
    }

    loadInitialData()

    // Set up real-time subscriptions
    const messagesSubscription = supabase
      .channel("messages-channel")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          console.log("New message received:", payload)
          const newMessage = payload.new as MessageRecord

          // Get the user name for the message
          const { data: userData } = await supabase.from("users").select("name").eq("id", newMessage.user_id).single()

          const userName = userData?.name || "Unknown"

          setMessages((prev) => [
            ...prev,
            {
              id: newMessage.id.toString(),
              sender: userName,
              senderId: newMessage.user_id,
              text: newMessage.text,
              timestamp: new Date(newMessage.timestamp),
            },
          ])
        },
      )
      .subscribe()

    // Cleanup subscriptions
    return () => {
      console.log("Cleaning up subscriptions")
      supabase.removeChannel(messagesSubscription)
    }
  }, [version]) // Only run when version changes

  // Mark component as hydrated after mount
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Toggle availability for a participant on a specific day
  const toggleAvailability = async (userId: number, dateKey: string) => {
    // Only allow toggling if this is the selected user
    if (userId !== selectedUserId) return

    // Make sure the participant and dateKey exist in our state
    if (!availability[userId] || availability[userId][dateKey] === undefined) return

    // Update local state first for immediate feedback
    const newValue = !availability[userId][dateKey]
    setAvailability((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [dateKey]: newValue,
      },
    }))

    try {
      console.log(`Toggling availability for user ${userId} on date ${dateKey} to ${newValue}`)

      // Update or insert availability record
      const { data, error } = await supabase.from("availability").upsert(
        {
          user_id: userId,
          date_key: dateKey,
          is_available: newValue,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,date_key",
        },
      )

      if (error) {
        console.error("Error updating availability:", error)
        throw error
      }

      console.log("Availability update result:", data)

      // If making unavailable, also remove favored status
      if (!newValue && favoredDays[userId] && favoredDays[userId][dateKey]) {
        toggleFavored(userId, dateKey)
      }

      // Check if this was the last available date being cleared
      let hasAnyAvailableDates = false
      if (!newValue) {
        // Check if there are any remaining available dates for this user
        for (const date of weekdays) {
          const key = date.toISOString()
          // Skip the current date we just updated
          if (key === dateKey) continue

          if (availability[userId] && availability[userId][key]) {
            hasAnyAvailableDates = true
            break
          }
        }
      }

      // Mark user as responded only if they have at least one available date
      // or if they're marking a date as available
      await updateUserResponse(userId, newValue || hasAnyAvailableDates, responses[userId]?.cantAttend || false)
    } catch (error) {
      console.error("Error updating availability:", error)
      // Revert local state if the update failed
      setAvailability((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          [dateKey]: !newValue,
        },
      }))
      toast({
        title: "Error",
        description: "Failed to update availability. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Toggle favored status for a participant on a specific day
  const toggleFavored = async (userId: number, dateKey: string) => {
    // Only allow toggling if this is the selected user
    if (userId !== selectedUserId) return

    // Make sure the participant and dateKey exist in our state
    if (!availability[userId] || !favoredDays[userId]) return

    // Only allow toggling favored if the day is available
    if (availability[userId][dateKey]) {
      const newValue = !favoredDays[userId][dateKey]

      // Update local state first for immediate feedback
      setFavoredDays((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          [dateKey]: newValue,
        },
      }))

      try {
        console.log(`Toggling favorite for user ${userId} on date ${dateKey} to ${newValue}`)

        // Update or insert favorite record
        const { data, error } = await supabase.from("favorites").upsert(
          {
            user_id: userId,
            date_key: dateKey,
            is_favorite: newValue,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id,date_key",
          },
        )

        if (error) {
          console.error("Error updating favorites:", error)
          throw error
        }

        console.log("Favorites update result:", data)

        // Mark user as responded
        await updateUserResponse(userId, true, responses[userId]?.cantAttend || false)
      } catch (error) {
        console.error("Error updating favorites:", error)
        // Revert local state if the update failed
        setFavoredDays((prev) => ({
          ...prev,
          [userId]: {
            ...prev[userId],
            [dateKey]: !newValue,
          },
        }))
        toast({
          title: "Error",
          description: "Failed to update favorite status. Please try again.",
          variant: "destructive",
        })
      }
    } else if (favoredDays[userId][dateKey]) {
      // If the day is marked as favored but not available, remove the favored status
      setFavoredDays((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          [dateKey]: false,
        },
      }))

      try {
        // Update favorite record
        const { error } = await supabase.from("favorites").upsert(
          {
            user_id: userId,
            date_key: dateKey,
            is_favorite: false,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id,date_key",
          },
        )

        if (error) throw error
      } catch (error) {
        console.error("Error updating favorites:", error)
        toast({
          title: "Error",
          description: "Failed to update favorite status. Please try again.",
          variant: "destructive",
        })
      }
    }
  }

  // Set all days as available or unavailable for a participant
  const setAllAvailability = async (userId: number, value: boolean) => {
    // Only allow setting if this is the selected user
    if (userId !== selectedUserId) return

    setIsLoading(true)

    try {
      console.log(`Setting all availability for user ${userId} to ${value}`)

      // Update local state first for immediate feedback
      const newAvailability = { ...availability }
      const newFavoredDays = { ...favoredDays }

      // Create batch operations for database
      const availabilityBatch = []

      for (const date of weekdays) {
        const dateKey = date.toISOString()

        // Update local state
        if (newAvailability[userId]) {
          newAvailability[userId][dateKey] = value
        }

        // If making unavailable, also remove favored status
        if (!value && newFavoredDays[userId] && newFavoredDays[userId][dateKey]) {
          newFavoredDays[userId][dateKey] = false
        }

        // Add to database batch
        availabilityBatch.push({
          user_id: userId,
          date_key: dateKey,
          is_available: value,
          updated_at: new Date().toISOString(),
        })
      }

      // Update state
      setAvailability(newAvailability)
      setFavoredDays(newFavoredDays)

      // If making all unavailable, delete all availability and favorites records
      if (!value) {
        // Delete all availability records for this user
        const { error: deleteAvailError } = await supabase.from("availability").delete().eq("user_id", userId)

        if (deleteAvailError) {
          console.error("Error deleting availability:", deleteAvailError)
          throw deleteAvailError
        }

        // Delete all favorites records for this user
        const { error: deleteFavError } = await supabase.from("favorites").delete().eq("user_id", userId)

        if (deleteFavError) {
          console.error("Error deleting favorites:", deleteFavError)
          throw deleteFavError
        }
      } else {
        // Insert all availability records
        const { error } = await supabase
          .from("availability")
          .upsert(availabilityBatch, { onConflict: "user_id,date_key" })

        if (error) {
          console.error("Error upserting availability batch:", error)
          throw error
        }
      }

      // Mark user as responded or not responded based on the action
      // If clearing all entries (value is false), mark as not responded
      await updateUserResponse(userId, value, false)

      toast({
        title: "Success",
        description: value ? "All days marked as available" : "All days marked as unavailable",
      })
    } catch (error) {
      console.error("Error updating all availability:", error)
      toast({
        title: "Error",
        description: "Failed to update availability. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Update user response status
  const updateUserResponse = async (userId: number, hasResponded: boolean, cantAttend: boolean) => {
    try {
      console.log(`Updating response for user ${userId}: hasResponded=${hasResponded}, cantAttend=${cantAttend}`)

      // Update local state
      setResponses((prev) => ({
        ...prev,
        [userId]: {
          hasResponded,
          cantAttend,
        },
      }))

      // Update database
      const { data, error } = await supabase.from("responses").upsert(
        {
          user_id: userId,
          has_responded: hasResponded,
          cant_attend: cantAttend,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        },
      )

      if (error) {
        console.error("Error updating response:", error)
        throw error
      }

      console.log("Response update result:", data)
    } catch (error) {
      console.error("Error updating response status:", error)
      toast({
        title: "Error",
        description: "Failed to update response status. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Toggle "can't attend" status
  const toggleCantAttend = async (userId: number) => {
    // Only allow toggling if this is the selected user
    if (userId !== selectedUserId) return

    // Make sure the participant exists in our responses state
    if (!responses[userId]) return

    const newValue = !responses[userId]?.cantAttend

    try {
      setIsLoading(true)
      console.log(`Toggling can't attend for user ${userId} to ${newValue}`)

      // If marking as "can't attend", clear all availability
      if (newValue) {
        // Update local state
        const newAvailability = { ...availability }
        const newFavoredDays = { ...favoredDays }

        for (const date of weekdays) {
          const dateKey = date.toISOString()
          if (newAvailability[userId]) {
            newAvailability[userId][dateKey] = false
          }
          if (newFavoredDays[userId]) {
            newFavoredDays[userId][dateKey] = false
          }
        }

        setAvailability(newAvailability)
        setFavoredDays(newFavoredDays)

        // Delete all availability records for this user
        const { error: deleteAvailError } = await supabase.from("availability").delete().eq("user_id", userId)
        if (deleteAvailError) {
          console.error("Error deleting availability:", deleteAvailError)
          throw deleteAvailError
        }

        // Delete all favorites records for this user
        const { error: deleteFavError } = await supabase.from("favorites").delete().eq("user_id", userId)
        if (deleteFavError) {
          console.error("Error deleting favorites:", deleteFavError)
          throw deleteFavError
        }
      }

      // Update response status
      await updateUserResponse(userId, true, newValue)

      toast({
        title: "Success",
        description: newValue ? "Marked as unable to attend any dates" : "You can now select available dates",
      })
    } catch (error) {
      console.error("Error updating can't attend status:", error)
      toast({
        title: "Error",
        description: "Failed to update attendance status. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate the best day(s) for dinner
  const getBestDays = () => {
    // Make sure all required data is available
    if (!participants.length || !Object.keys(availability).length) {
      return []
    }

    const dayCounts = weekdays.map((date) => {
      const dateKey = date.toISOString()

      // Count available participants with defensive checks
      const availableCount = participants.filter(
        (participant) => availability[participant.id] && availability[participant.id][dateKey],
      ).length

      // Count favored participants (only count if also available) with defensive checks
      const favoredCount = participants.filter(
        (participant) =>
          availability[participant.id] &&
          availability[participant.id][dateKey] &&
          favoredDays[participant.id] &&
          favoredDays[participant.id][dateKey],
      ).length

      // Count responded participants for this date
      const respondedCount = getRespondedCount()

      return {
        date,
        availableCount,
        favoredCount,
        respondedCount,
        // Combined score: available count + bonus for favored
        score: availableCount + favoredCount * 0.5,
      }
    })

    // Filter out days with no availability
    const availableDays = dayCounts.filter((d) => d.availableCount > 0)
    if (availableDays.length === 0) return []

    // Group days by score
    const daysByScore = availableDays.reduce(
      (acc, day) => {
        if (!acc[day.score]) {
          acc[day.score] = []
        }
        acc[day.score].push(day)
        return acc
      },
      {} as Record<number, typeof availableDays>,
    )

    // Sort scores in descending order
    const sortedScores = Object.keys(daysByScore)
      .map(Number)
      .sort((a, b) => b - a)

    // Take top 3 scores
    const topScores = sortedScores.slice(0, 3)

    // Return days for top 3 scores
    return topScores.map((score) => ({
      score,
      days: daysByScore[score].map((d) => ({
        date: d.date,
        availableCount: d.availableCount,
        favoredCount: d.favoredCount,
        respondedCount: d.respondedCount,
      })),
    }))
  }

  // Count how many participants have made any selection
  const getRespondedCount = () => {
    return participants.filter((participant) => responses[participant.id] && responses[participant.id]?.hasResponded)
      .length
  }

  // Get participants who can't attend
  const getCantAttendParticipants = () => {
    return participants.filter((participant) => responses[participant.id] && responses[participant.id]?.cantAttend)
  }

  // Format date for mobile view
  const formatDateMobile = (date: Date) => {
    return date.toLocaleDateString("sv-SE", { day: "numeric", month: "numeric" })
  }

  // Format weekday for mobile view
  const formatWeekdayMobile = (date: Date) => {
    return date.toLocaleDateString("sv-SE", { weekday: "short" }).substring(0, 2)
  }

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name.charAt(0)
  }

  // Get random color for avatar based on name
  const getAvatarColor = (name: string) => {
    const colors = [
      "bg-red-100 text-red-800",
      "bg-blue-100 text-blue-800",
      "bg-green-100 text-green-800",
      "bg-yellow-100 text-yellow-800",
      "bg-purple-100 text-purple-800",
    ]
    const index = name.length % colors.length
    return colors[index]
  }

  // Sort users with selected user at the top
  const getSortedParticipants = (users: Participant[], selectedId: number | null) => {
    if (!selectedId) return users

    return [...users.filter((user) => user.id === selectedId), ...users.filter((user) => user.id !== selectedId)]
  }

  // Handle user selection
  const handleUserSelect = async (userId: number) => {
    try {
      // Find the user name
      const user = participants.find((p) => p.id === userId)
      if (!user) {
        throw new Error("User not found")
      }

      // Set the new selected user
      setSelectedUserId(userId)
      setSelectedUserName(user.name)
      setShowUserDialog(false)
    } catch (error) {
      console.error("Error selecting user:", error)
      toast({
        title: "Error",
        description: "Failed to select user. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Handle sending a new message
  const handleSendMessage = async () => {
    if (newMessage.trim() === "" || !selectedUserId) return

    const timestamp = new Date()

    // Create new message object for local state
    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: selectedUserName || "Unknown",
      senderId: selectedUserId,
      text: newMessage.trim(),
      timestamp: timestamp,
    }

    // Update local state first for immediate feedback
    setMessages((prev) => [...prev, newMsg])
    setNewMessage("")

    try {
      // Save message to database
      const { error } = await supabase.from("messages").insert({
        user_id: selectedUserId,
        text: newMessage.trim(),
        timestamp: timestamp.toISOString(),
      })

      if (error) throw error
    } catch (error) {
      console.error("Error sending message:", error)
      // Remove the message from local state if the save failed
      setMessages((prev) => prev.filter((msg) => msg.id !== newMsg.id))
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Format timestamp for chat messages
  const formatMessageTime = (date: Date) => {
    return date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
  }

  // Scroll to bottom of chat when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Handle version change
  const handleVersionChange = (newVersion: string) => {
    if (version === newVersion) return // Don't do anything if version hasn't changed

    const url = new URL(window.location.href)
    url.searchParams.set("version", newVersion)
    window.history.pushState({}, "", url)
    setVersion(newVersion)

    // Update participants based on the new version
    setParticipants(userSets[newVersion] || [])
    setSelectedUserId(null) // Reset selected user when changing versions
    setSelectedUserName(null)
  }

  return (
    <div className="min-h-screen bg-[#f9f5f3]">
      {/* Only render the custom dialog when hydrated */}
      {isHydrated && (
        <UserSelectionDialog
          isOpen={showUserDialog}
          participants={participants}
          selectedUserId={selectedUserId}
          isLoading={isLoading}
          onUserSelect={handleUserSelect}
          getAvatarColor={getAvatarColor}
          getInitials={getInitials}
          getSortedParticipants={getSortedParticipants}
        />
      )}

      <div className="container mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl md:text-3xl font-bold">After Work</h1>
          <div className="flex gap-2">
            <Button
              variant={version === "default" ? "default" : "outline"}
              size="sm"
              onClick={() => handleVersionChange("default")}
            >
              Version 1
            </Button>
            <Button
              variant={version === "v2" ? "default" : "outline"}
              size="sm"
              onClick={() => handleVersionChange("v2")}
            >
              Version 2
            </Button>
          </div>
        </div>

        {loadingError && (
          <Alert className="mb-4 bg-red-50 border-red-200">
            <AlertDescription className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span>Error loading data: {loadingError}</span>
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm p-8 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
              <p className="text-gray-500">Laddar data...</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {/* Header section */}
            <div className="border-b border-gray-100 p-4 md:p-6">
              {selectedUserId ? (
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className={`h-10 w-10 ${getAvatarColor(selectedUserName || "")}`}>
                    <AvatarFallback>{getInitials(selectedUserName || "")}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-xl font-semibold">{selectedUserName}</h2>
                    <p className="text-sm text-gray-600">Välj vilka dagar i maj som passar för after work</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setShowUserDialog(true)}
                    disabled={isLoading}
                  >
                    Välj användare
                  </Button>
                </div>
              ) : (
                <p className="text-sm md:text-base text-gray-600">Välj vilka dagar i maj som passar för after work</p>
              )}
              <div className="flex flex-col md:flex-row md:items-center gap-2 text-sm text-gray-500">
                <div className="flex items-center gap-1">
                  <Checkbox
                    className="data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                    checked={true}
                    disabled
                  />
                  <span>Tillgänglig</span>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-red-500 text-red-500" />
                  <span>Favoritdag</span>
                </div>
              </div>
            </div>

            {/* Main content with tabs */}
            <Tabs defaultValue="availability" className="w-full">
              <TabsList className="w-full border-b rounded-none bg-white px-4 md:px-6">
                <TabsTrigger value="availability" className="flex-1 data-[state=active]:text-red-500">
                  Tillgänglighet
                </TabsTrigger>
                <TabsTrigger value="chat" className="flex-1 data-[state=active]:text-red-500">
                  Diskutera här
                </TabsTrigger>
              </TabsList>

              {/* Availability Tab */}
              <TabsContent value="availability" className="p-4 md:p-6">
                {selectedUserId ? (
                  <>
                    {/* Can't attend checkbox */}
                    <div className="mb-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="cant-attend"
                          checked={responses[selectedUserId]?.cantAttend || false}
                          onCheckedChange={() => toggleCantAttend(selectedUserId)}
                          disabled={isLoading}
                          className="data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                        />
                        <label
                          htmlFor="cant-attend"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Jag kan inte delta någon av dessa dagar
                        </label>
                      </div>
                    </div>

                    {responses[selectedUserId]?.cantAttend && (
                      <Alert className="mb-6 bg-red-50 border-red-200">
                        <AlertDescription className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          <span>Du har markerat att du inte kan delta någon av dessa dagar.</span>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Mobile view - show all users */}
                    <div className="md:hidden mb-6">
                      {getSortedParticipants(participants, selectedUserId).map((participant) => {
                        const isCurrentUser = participant.id === selectedUserId
                        const cantAttend = responses[participant.id]?.cantAttend

                        return (
                          <div
                            key={participant.id}
                            className={`mb-6 p-3 rounded-lg ${isCurrentUser ? "bg-white shadow-sm" : "bg-gray-50 border"}`}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Avatar className={`h-6 w-6 ${getAvatarColor(participant.name)}`}>
                                  <AvatarFallback>{getInitials(participant.name)}</AvatarFallback>
                                </Avatar>
                                <h3 className="font-medium">{participant.name}</h3>
                                {isCurrentUser && (
                                  <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">Du</span>
                                )}
                              </div>

                              {isCurrentUser && !cantAttend && (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex items-center gap-1"
                                    onClick={() => setAllAvailability(participant.id, true)}
                                    disabled={isLoading}
                                  >
                                    <PlusCircle className="h-4 w-4 text-green-500" />
                                    <span>Alla</span>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex items-center gap-1"
                                    onClick={() => setAllAvailability(participant.id, false)}
                                    disabled={isLoading}
                                  >
                                    <MinusCircle className="h-4 w-4 text-red-500" />
                                    <span>Inga</span>
                                  </Button>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-5 gap-2">
                              {weekdays.map((date) => {
                                const dateKey = date.toISOString()
                                const isAvailable = availability[participant.id]?.[dateKey] || false
                                const isFavored = favoredDays[participant.id]?.[dateKey] || false

                                return (
                                  <div
                                    key={`${participant.id}-${dateKey}-mobile`}
                                    className="flex flex-col items-center border rounded-lg p-2"
                                  >
                                    <div className="text-xs font-medium text-gray-500">{formatWeekdayMobile(date)}</div>
                                    <div className="text-sm mb-1">{formatDateMobile(date)}</div>
                                    <div className="flex flex-col items-center gap-1">
                                      {cantAttend ? (
                                        <XCircle className="h-4 w-4 text-red-300" />
                                      ) : (
                                        <>
                                          <Checkbox
                                            checked={isAvailable}
                                            onCheckedChange={() => {
                                              toggleAvailability(participant.id, dateKey)
                                              if (isAvailable && isFavored) {
                                                toggleFavored(participant.id, dateKey)
                                              }
                                            }}
                                            className="data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500 h-5 w-5"
                                            disabled={!isCurrentUser || isLoading}
                                          />
                                          <button
                                            onClick={() => toggleFavored(participant.id, dateKey)}
                                            disabled={!isAvailable || !isCurrentUser || isLoading}
                                            className={`flex items-center justify-center h-6 w-6 rounded-full ${
                                              !isAvailable || !isCurrentUser
                                                ? "opacity-30 cursor-not-allowed"
                                                : "cursor-pointer"
                                            }`}
                                          >
                                            <Star
                                              className={`h-5 w-5 ${
                                                isFavored && isAvailable ? "fill-red-500 text-red-500" : "text-gray-400"
                                              }`}
                                            />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Desktop view */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full table-auto border-collapse">
                        <thead>
                          <tr>
                            <th className="text-left p-2 font-medium text-gray-500 border-b">Deltagare</th>
                            <th className="text-center p-2 font-medium text-gray-500 border-b">Åtgärder</th>
                            {weekdays.map((date) => (
                              <th
                                key={date.toISOString()}
                                className="text-center p-2 font-medium text-gray-500 border-b"
                              >
                                <div className="text-center">
                                  <div className="text-xs font-medium text-gray-500">
                                    {date.toLocaleDateString("sv-SE", { weekday: "short" })}
                                  </div>
                                  <div className="text-sm">
                                    {date.toLocaleDateString("sv-SE", { day: "numeric", month: "numeric" })}
                                  </div>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {getSortedParticipants(participants, selectedUserId).map((participant) => {
                            const isCurrentUser = participant.id === selectedUserId
                            const cantAttend = responses[participant.id]?.cantAttend

                            return (
                              <tr
                                key={participant.id}
                                className={`border-b border-gray-100 ${isCurrentUser ? "bg-white" : "bg-gray-50"}`}
                              >
                                <td className="p-2 font-medium text-left">
                                  <div className="flex items-center gap-2">
                                    <Avatar className={`h-6 w-6 ${getAvatarColor(participant.name)}`}>
                                      <AvatarFallback>{getInitials(participant.name)}</AvatarFallback>
                                    </Avatar>
                                    {participant.name}
                                    {participant.id === selectedUserId && (
                                      <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">Du</span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2 text-center">
                                  {!cantAttend && (
                                    <div className="flex justify-center gap-2">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                        onClick={() => setAllAvailability(participant.id, true)}
                                        disabled={!isCurrentUser || isLoading}
                                      >
                                        <PlusCircle
                                          className={`h-4 w-4 ${isCurrentUser ? "text-green-500" : "text-gray-300"}`}
                                        />
                                        <span className="sr-only">Markera alla</span>
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                        onClick={() => setAllAvailability(participant.id, false)}
                                        disabled={!isCurrentUser || isLoading}
                                      >
                                        <MinusCircle
                                          className={`h-4 w-4 ${isCurrentUser ? "text-red-500" : "text-gray-300"}`}
                                        />
                                        <span className="sr-only">Avmarkera alla</span>
                                      </Button>
                                    </div>
                                  )}
                                </td>
                                {weekdays.map((date) => {
                                  const dateKey = date.toISOString()
                                  const isAvailable = availability[participant.id]?.[dateKey] || false
                                  const isFavored = favoredDays[participant.id]?.[dateKey] || false

                                  return (
                                    <td key={`${participant.id}-${dateKey}`} className="p-2 text-center">
                                      {cantAttend ? (
                                        <XCircle className="h-4 w-4 text-red-300 mx-auto" />
                                      ) : (
                                        <div className="flex flex-col items-center">
                                          <Checkbox
                                            checked={isAvailable}
                                            onCheckedChange={() => {
                                              toggleAvailability(participant.id, dateKey)
                                              if (isAvailable && isFavored) {
                                                toggleFavored(participant.id, dateKey)
                                              }
                                            }}
                                            className={`
                      data-[state=checked]:bg-red-500 
                      data-[state=checked]:border-red-500
                      ${!isCurrentUser ? "opacity-60" : ""}
                    `}
                                            disabled={participant.id !== selectedUserId || isLoading}
                                          />
                                          <button
                                            onClick={() => toggleFavored(participant.id, dateKey)}
                                            disabled={!isAvailable || participant.id !== selectedUserId || isLoading}
                                            className={`flex items-center justify-center h-6 w-6 rounded-full ${
                                              !isAvailable || participant.id !== selectedUserId
                                                ? "opacity-30 cursor-not-allowed"
                                                : "cursor-pointer"
                                            }`}
                                          >
                                            <Star
                                              className={`h-5 w-5 ${
                                                isFavored && isAvailable ? "fill-red-500 text-red-500" : "text-gray-400"
                                              }`}
                                            />
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-500">Välj en användare för att visa tillgänglighet.</p>
                )}
              </TabsContent>

              {/* Chat Tab */}
              <TabsContent value="chat" className="p-4 md:p-6">
                {selectedUserId ? (
                  <div className="flex flex-col h-[500px]">
                    {/* Chat messages */}
                    <div className="flex-1 overflow-y-auto mb-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`mb-2 p-2 rounded-lg ${
                            message.senderId === selectedUserId ? "bg-red-100 ml-auto" : "bg-gray-100 mr-auto"
                          } w-fit max-w-[80%]`}
                        >
                          <div className="text-xs text-gray-500">{message.sender}</div>
                          <div>{message.text}</div>
                          <div className="text-xs text-gray-500 text-right">{formatMessageTime(message.timestamp)}</div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Message input */}
                    <div className="flex items-center">
                      <input
                        type="text"
                        className="flex-1 border rounded-lg py-2 px-3 mr-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder="Skriv ett meddelande..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSendMessage()
                          }
                        }}
                      />
                      <Button onClick={handleSendMessage} disabled={isLoading}>
                        Skicka
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">Välj en användare för att starta chatten.</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Best days calculation */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Förslag på bästa dagar</h2>
          {getCantAttendParticipants().length > 0 && (
            <Alert className="mb-4 bg-yellow-50 border-yellow-200">
              <AlertDescription className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-yellow-500" />
                <span>
                  {getCantAttendParticipants()
                    .map((p) => p.name)
                    .join(", ")}{" "}
                  kan inte delta någon av dessa dagar.
                </span>
              </AlertDescription>
            </Alert>
          )}
          {getBestDays().length > 0 ? (
            <div className="space-y-4">
              {getBestDays().map((group, groupIndex) => (
                <div key={`group-${groupIndex}`} className="p-4 md:p-5 bg-white rounded-lg border border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    {groupIndex === 0 ? (
                      <span className="text-sm font-medium bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                        Bästa alternativet
                      </span>
                    ) : groupIndex === 1 ? (
                      <span className="text-sm font-medium bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        Näst bästa alternativet
                      </span>
                    ) : (
                      <span className="text-sm font-medium bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full">
                        Tredje bästa alternativet
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {group.days.map(({ date, availableCount, favoredCount, respondedCount }) => (
                      <div
                        key={date.toISOString()}
                        className="flex flex-col md:flex-row md:items-center md:justify-between bg-white p-3 rounded-md shadow-sm border border-gray-100"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {date.toLocaleDateString("sv-SE", {
                              weekday: isMobile ? "short" : "long",
                              day: "numeric",
                              month: isMobile ? "numeric" : "long",
                            })}
                          </span>
                          <div className="flex items-center gap-1 bg-red-50 text-red-500 px-2 py-0.5 rounded-full text-xs">
                            <Star className="h-3 w-3 fill-red-500 text-red-500" />
                            <span>{favoredCount}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 mt-1 md:mt-0">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-600">
                            {availableCount} av {participants.length} tillgängliga ({respondedCount} har svarat)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>Inga förslag på bästa dagar kunde hittas.</p>
          )}
        </div>
      </div>
    </div>
  )
}

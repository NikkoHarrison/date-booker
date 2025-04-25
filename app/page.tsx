"use client"

import { useState, useRef, useEffect } from "react"
import { Star, Users, PlusCircle, MinusCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useMobile } from "@/hooks/use-mobile"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  supabase,
  type AvailabilityRecord,
  type FavoriteRecord,
  type MessageRecord,
  type ResponseRecord,
} from "@/lib/supabase"
import { toast } from "@/hooks/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"

// Define message type
interface ChatMessage {
  id: string
  sender: string
  text: string
  timestamp: Date
}

export default function AfterWorkPlanner() {
  const isMobile = useMobile()
  const participants = ["Björn", "Harald", "Marvin", "Nikko", "Samuel"]

  // State for loading status
  const [isLoading, setIsLoading] = useState(true)

  // State for user selection
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [showUserDialog, setShowUserDialog] = useState(true)

  // State for chat
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // State for responses
  const [responses, setResponses] = useState<Record<string, { hasResponded: boolean; cantAttend: boolean }>>(
    participants.reduce(
      (acc, participant) => {
        acc[participant] = { hasResponded: false, cantAttend: false }
        return acc
      },
      {} as Record<string, { hasResponded: boolean; cantAttend: boolean }>,
    ),
  )

  // Generate all weekdays in May 2025
  const generateMayWeekdays = () => {
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
  }

  const weekdays = generateMayWeekdays()

  // Initialize availability state with all false values
  const [availability, setAvailability] = useState<Record<string, Record<string, boolean>>>(
    participants.reduce(
      (acc, participant) => {
        acc[participant] = weekdays.reduce(
          (days, date) => {
            days[date.toISOString()] = false
            return days
          },
          {} as Record<string, boolean>,
        )
        return acc
      },
      {} as Record<string, Record<string, boolean>>,
    ),
  )

  // Initialize favored days state with all false values
  const [favoredDays, setFavoredDays] = useState<Record<string, Record<string, boolean>>>(
    participants.reduce(
      (acc, participant) => {
        acc[participant] = weekdays.reduce(
          (days, date) => {
            days[date.toISOString()] = false
            return days
          },
          {} as Record<string, boolean>,
        )
        return acc
      },
      {} as Record<string, Record<string, boolean>>,
    ),
  )

  // Load initial data from Supabase
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true)
      try {
        // Load selected users
        const { data: usersData, error: usersError } = await supabase.from("users").select("*")

        if (usersError) throw usersError

        // Load availability data
        const { data: availabilityData, error: availabilityError } = await supabase.from("availability").select("*")

        if (availabilityError) throw availabilityError

        // Update availability state
        const newAvailability = { ...availability }
        availabilityData.forEach((record: AvailabilityRecord) => {
          if (newAvailability[record.user_name]) {
            newAvailability[record.user_name][record.date_key] = record.is_available
          }
        })
        setAvailability(newAvailability)

        // Load favorites data
        const { data: favoritesData, error: favoritesError } = await supabase.from("favorites").select("*")

        if (favoritesError) throw favoritesError

        // Update favorites state
        const newFavorites = { ...favoredDays }
        favoritesData.forEach((record: FavoriteRecord) => {
          if (newFavorites[record.user_name]) {
            newFavorites[record.user_name][record.date_key] = record.is_favorite
          }
        })
        setFavoredDays(newFavorites)

        // Load responses data
        const { data: responsesData, error: responsesError } = await supabase.from("responses").select("*")

        if (responsesError) throw responsesError

        // Update responses state
        const newResponses = { ...responses }
        responsesData.forEach((record: ResponseRecord) => {
          if (newResponses[record.user_name]) {
            newResponses[record.user_name] = {
              hasResponded: record.has_responded,
              cantAttend: record.cant_attend,
            }
          }
        })
        setResponses(newResponses)

        // Load messages
        const { data: messagesData, error: messagesError } = await supabase
          .from("messages")
          .select("*")
          .order("timestamp", { ascending: true })

        if (messagesError) throw messagesError

        // Update messages state
        const chatMessages: ChatMessage[] = messagesData.map((record: MessageRecord) => ({
          id: record.id.toString(),
          sender: record.sender,
          text: record.text,
          timestamp: new Date(record.timestamp),
        }))
        setMessages(chatMessages)
      } catch (error) {
        console.error("Error loading data:", error)
        toast({
          title: "Error",
          description: "Failed to load data. Please try again.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
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
        (payload) => {
          const newMessage = payload.new as MessageRecord
          setMessages((prev) => [
            ...prev,
            {
              id: newMessage.id.toString(),
              sender: newMessage.sender,
              text: newMessage.text,
              timestamp: new Date(newMessage.timestamp),
            },
          ])
        },
      )
      .subscribe()

    // Cleanup subscriptions
    return () => {
      supabase.removeChannel(messagesSubscription)
    }
  }, [])

  // Toggle availability for a participant on a specific day
  const toggleAvailability = async (participant: string, dateKey: string) => {
    // Only allow toggling if this is the selected user
    if (participant !== selectedUser) return

    // Update local state first for immediate feedback
    const newValue = !availability[participant][dateKey]
    setAvailability((prev) => ({
      ...prev,
      [participant]: {
        ...prev[participant],
        [dateKey]: newValue,
      },
    }))

    try {
      // Update or insert availability record
      const { error } = await supabase.from("availability").upsert(
        {
          user_name: participant,
          date_key: dateKey,
          is_available: newValue,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_name,date_key",
        },
      )

      if (error) throw error

      // If making unavailable, also remove favored status
      if (!newValue && favoredDays[participant][dateKey]) {
        toggleFavored(participant, dateKey)
      }

      // Mark user as responded
      await updateUserResponse(participant, true, responses[participant]?.cantAttend || false)
    } catch (error) {
      console.error("Error updating availability:", error)
      // Revert local state if the update failed
      setAvailability((prev) => ({
        ...prev,
        [participant]: {
          ...prev[participant],
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
  const toggleFavored = async (participant: string, dateKey: string) => {
    // Only allow toggling if this is the selected user
    if (participant !== selectedUser) return

    // Only allow toggling favored if the day is available
    if (availability[participant][dateKey]) {
      const newValue = !favoredDays[participant][dateKey]

      // Update local state first for immediate feedback
      setFavoredDays((prev) => ({
        ...prev,
        [participant]: {
          ...prev[participant],
          [dateKey]: newValue,
        },
      }))

      try {
        // Update or insert favorite record
        const { error } = await supabase.from("favorites").upsert(
          {
            user_name: participant,
            date_key: dateKey,
            is_favorite: newValue,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_name,date_key",
          },
        )

        if (error) throw error

        // Mark user as responded
        await updateUserResponse(participant, true, responses[participant]?.cantAttend || false)
      } catch (error) {
        console.error("Error updating favorites:", error)
        // Revert local state if the update failed
        setFavoredDays((prev) => ({
          ...prev,
          [participant]: {
            ...prev[participant],
            [dateKey]: !newValue,
          },
        }))
        toast({
          title: "Error",
          description: "Failed to update favorite status. Please try again.",
          variant: "destructive",
        })
      }
    } else if (favoredDays[participant][dateKey]) {
      // If the day is marked as favored but not available, remove the favored status
      setFavoredDays((prev) => ({
        ...prev,
        [participant]: {
          ...prev[participant],
          [dateKey]: false,
        },
      }))

      try {
        // Update favorite record
        const { error } = await supabase.from("favorites").upsert(
          {
            user_name: participant,
            date_key: dateKey,
            is_favorite: false,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_name,date_key",
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
  const setAllAvailability = async (participant: string, value: boolean) => {
    // Only allow setting if this is the selected user
    if (participant !== selectedUser) return

    setIsLoading(true)

    try {
      // Update local state first for immediate feedback
      const newAvailability = { ...availability }
      const newFavoredDays = { ...favoredDays }

      // Create batch operations for database
      const availabilityBatch = []

      for (const date of weekdays) {
        const dateKey = date.toISOString()

        // Update local state
        newAvailability[participant][dateKey] = value

        // If making unavailable, also remove favored status
        if (!value && favoredDays[participant][dateKey]) {
          newFavoredDays[participant][dateKey] = false

          // Add to database batch
          availabilityBatch.push({
            user_name: participant,
            date_key: dateKey,
            is_available: value,
            updated_at: new Date().toISOString(),
          })
        } else {
          // Add to database batch
          availabilityBatch.push({
            user_name: participant,
            date_key: dateKey,
            is_available: value,
            updated_at: new Date().toISOString(),
          })
        }
      }

      // Update state
      setAvailability(newAvailability)
      setFavoredDays(newFavoredDays)

      // If making all unavailable, delete all availability and favorites records
      if (!value) {
        // Delete all availability records for this user
        const { error: deleteAvailError } = await supabase.from("availability").delete().eq("user_name", participant)

        if (deleteAvailError) throw deleteAvailError

        // Delete all favorites records for this user
        const { error: deleteFavError } = await supabase.from("favorites").delete().eq("user_name", participant)

        if (deleteFavError) throw deleteFavError
      } else {
        // Insert all availability records
        const { error } = await supabase
          .from("availability")
          .upsert(availabilityBatch, { onConflict: "user_name,date_key" })

        if (error) throw error
      }

      // Mark user as responded
      await updateUserResponse(participant, true, false)

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
  const updateUserResponse = async (participant: string, hasResponded: boolean, cantAttend: boolean) => {
    try {
      // Update local state
      setResponses((prev) => ({
        ...prev,
        [participant]: {
          hasResponded,
          cantAttend,
        },
      }))

      // Update database
      const { error } = await supabase.from("responses").upsert(
        {
          user_name: participant,
          has_responded: hasResponded,
          cant_attend: cantAttend,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_name",
        },
      )

      if (error) throw error
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
  const toggleCantAttend = async (participant: string) => {
    // Only allow toggling if this is the selected user
    if (participant !== selectedUser) return

    const newValue = !responses[participant]?.cantAttend

    try {
      setIsLoading(true)

      // If marking as "can't attend", clear all availability
      if (newValue) {
        // Update local state
        const newAvailability = { ...availability }
        const newFavoredDays = { ...favoredDays }

        for (const date of weekdays) {
          const dateKey = date.toISOString()
          newAvailability[participant][dateKey] = false
          newFavoredDays[participant][dateKey] = false
        }

        setAvailability(newAvailability)
        setFavoredDays(newFavoredDays)

        // Delete all availability records for this user
        const { error: deleteAvailError } = await supabase.from("availability").delete().eq("user_name", participant)
        if (deleteAvailError) throw deleteAvailError

        // Delete all favorites records for this user
        const { error: deleteFavError } = await supabase.from("favorites").delete().eq("user_name", participant)
        if (deleteFavError) throw deleteFavError
      }

      // Update response status
      await updateUserResponse(participant, true, newValue)

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
    const dayCounts = weekdays.map((date) => {
      const dateKey = date.toISOString()

      // Count available participants
      const availableCount = participants.filter((participant) => availability[participant][dateKey]).length

      // Count favored participants (only count if also available)
      const favoredCount = participants.filter(
        (participant) => availability[participant][dateKey] && favoredDays[participant][dateKey],
      ).length

      // Count responded participants for this date
      const respondedCount = getRespondedCount(dateKey)

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

  // Count how many participants have made any selection for a date
  const getRespondedCount = (dateKey: string) => {
    return participants.filter((participant) => responses[participant]?.hasResponded).length
  }

  // Replace the getCantAttendCount function with a function that returns the names
  const getCantAttendParticipants = () => {
    return participants.filter((participant) => responses[participant]?.cantAttend)
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
  const getSortedParticipants = (users: string[], selectedUser: string | null) => {
    if (!selectedUser) return users

    return [selectedUser, ...users.filter((user) => user !== selectedUser)]
  }

  // Handle user selection
  const handleUserSelect = async (user: string) => {
    try {
      // Set the new selected user
      setSelectedUser(user)
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

  // Handle user logout
  const handleLogout = async () => {
    if (selectedUser) {
      setSelectedUser(null)
      setShowUserDialog(true)
    }
  }

  // Handle sending a new message
  const handleSendMessage = async () => {
    if (newMessage.trim() === "" || !selectedUser) return

    const timestamp = new Date()

    // Create new message object for local state
    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: selectedUser,
      text: newMessage.trim(),
      timestamp: timestamp,
    }

    // Update local state first for immediate feedback
    setMessages((prev) => [...prev, newMsg])
    setNewMessage("")

    try {
      // Save message to database
      const { error } = await supabase.from("messages").insert({
        sender: selectedUser,
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

  // Ensure user dialog is shown on first load
  useEffect(() => {
    setShowUserDialog(true)
  }, [])

  return (
    <div className="min-h-screen bg-[#f9f5f3]">
      {/* User selection dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">Vem är du?</DialogTitle>
            <DialogDescription className="text-center">
              Välj ditt namn för att markera dina tillgängliga dagar
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-4">
            {getSortedParticipants(participants, selectedUser).map((participant) => (
              <Button
                key={participant}
                variant="outline"
                className="flex items-center justify-start gap-3 h-14 px-4"
                onClick={() => handleUserSelect(participant)}
                disabled={isLoading}
              >
                <Avatar className={`h-8 w-8 ${getAvatarColor(participant)}`}>
                  <AvatarFallback>{getInitials(participant)}</AvatarFallback>
                </Avatar>
                <span className="text-lg">{participant}</span>
                {participant === selectedUser && (
                  <span className="ml-auto text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">Nuvarande</span>
                )}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="container mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl md:text-3xl font-bold">After Work</h1>
        </div>

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
              {selectedUser ? (
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className={`h-10 w-10 ${getAvatarColor(selectedUser)}`}>
                    <AvatarFallback>{getInitials(selectedUser)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-xl font-semibold">{selectedUser}</h2>
                    <p className="text-sm text-gray-600">Välj vilka dagar i maj som passar för after work</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setShowUserDialog(true)}
                    disabled={isLoading}
                  >
                    Byt användare
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
                {selectedUser ? (
                  <>
                    {/* Can't attend checkbox */}
                    <div className="mb-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="cant-attend"
                          checked={responses[selectedUser]?.cantAttend || false}
                          onCheckedChange={() => toggleCantAttend(selectedUser)}
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

                    {responses[selectedUser]?.cantAttend && (
                      <Alert className="mb-6 bg-red-50 border-red-200">
                        <AlertDescription className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          <span>Du har markerat att du inte kan delta någon av dessa dagar.</span>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Mobile view - show all users */}
                    <div className="md:hidden mb-6">
                      {getSortedParticipants(participants, selectedUser).map((participant) => {
                        const isCurrentUser = participant === selectedUser
                        const cantAttend = responses[participant]?.cantAttend

                        return (
                          <div
                            key={participant}
                            className={`mb-6 p-3 rounded-lg ${isCurrentUser ? "bg-white shadow-sm" : "bg-gray-50 border"}`}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Avatar className={`h-6 w-6 ${getAvatarColor(participant)}`}>
                                  <AvatarFallback>{getInitials(participant)}</AvatarFallback>
                                </Avatar>
                                <h3 className="font-medium">{participant}</h3>
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
                                    onClick={() => setAllAvailability(participant, true)}
                                    disabled={isLoading}
                                  >
                                    <PlusCircle className="h-4 w-4 text-green-500" />
                                    <span>Alla</span>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex items-center gap-1"
                                    onClick={() => setAllAvailability(participant, false)}
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
                                const isAvailable = availability[participant][dateKey]
                                const isFavored = favoredDays[participant][dateKey]

                                return (
                                  <div
                                    key={`${participant}-${dateKey}-mobile`}
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
                                              toggleAvailability(participant, dateKey)
                                              if (isAvailable && isFavored) {
                                                toggleFavored(participant, dateKey)
                                              }
                                            }}
                                            className="data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500 h-5 w-5"
                                            disabled={!isCurrentUser || isLoading}
                                          />
                                          <button
                                            onClick={() => toggleFavored(participant, dateKey)}
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
                            <th></th>
                            {weekdays.map((date) => (
                              <th key={date.toISOString()} className="p-2">
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
                          {getSortedParticipants(participants, selectedUser).map((participant) => {
                            const isCurrentUser = participant === selectedUser
                            const cantAttend = responses[participant]?.cantAttend

                            return (
                              <tr
                                key={participant}
                                className={`border-b border-gray-100 ${isCurrentUser ? "bg-white" : "bg-gray-50"}`}
                              >
                                <td className="p-2 font-medium text-left">
                                  <div className="flex items-center gap-2">
                                    <Avatar className={`h-6 w-6 ${getAvatarColor(participant)}`}>
                                      <AvatarFallback>{getInitials(participant)}</AvatarFallback>
                                    </Avatar>
                                    {participant}
                                    {participant === selectedUser && (
                                      <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">Du</span>
                                    )}
                                  </div>
                                </td>
                                {weekdays.map((date) => {
                                  const dateKey = date.toISOString()
                                  const isAvailable = availability[participant][dateKey]
                                  const isFavored = favoredDays[participant][dateKey]

                                  return (
                                    <td key={`${participant}-${dateKey}`} className="p-2 text-center">
                                      {cantAttend ? (
                                        <XCircle className="h-4 w-4 text-red-300 mx-auto" />
                                      ) : (
                                        <div className="flex flex-col items-center">
                                          <Checkbox
                                            checked={isAvailable}
                                            onCheckedChange={() => {
                                              toggleAvailability(participant, dateKey)
                                              if (isAvailable && isFavored) {
                                                toggleFavored(participant, dateKey)
                                              }
                                            }}
                                            className={`
                      data-[state=checked]:bg-red-500 
                      data-[state=checked]:border-red-500
                      ${!isCurrentUser ? "opacity-60" : ""}
                    `}
                                            disabled={participant !== selectedUser || isLoading}
                                          />
                                          <button
                                            onClick={() => toggleFavored(participant, dateKey)}
                                            disabled={!isAvailable || participant !== selectedUser || isLoading}
                                            className={`flex items-center justify-center h-6 w-6 rounded-full ${
                                              !isAvailable || participant !== selectedUser
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
                {selectedUser ? (
                  <div className="flex flex-col h-[500px]">
                    {/* Chat messages */}
                    <div className="flex-1 overflow-y-auto mb-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`mb-2 p-2 rounded-lg ${
                            message.sender === selectedUser ? "bg-red-100 ml-auto" : "bg-gray-100 mr-auto"
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
                <span>{getCantAttendParticipants().join(", ")} kan inte delta någon av dessa dagar.</span>
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
                        Bästa alternativ
                      </span>
                    ) : groupIndex === 1 ? (
                      <span className="text-sm font-medium bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        Näst bästa alternativ
                      </span>
                    ) : (
                      <span className="text-sm font-medium bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full">
                        Tredje bästa alternativ
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

        {/* Logout button */}
        {selectedUser && (
          <div className="mt-8">
            <Button variant="destructive" onClick={handleLogout} disabled={isLoading}>
              Logga ut
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

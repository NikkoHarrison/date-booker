"use client"

import { useState, useRef, useEffect, useMemo, use } from "react"
import { Star, Users, PlusCircle, MinusCircle, XCircle, Copy } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Checkbox } from "../../components/ui/checkbox"
import { useMobile } from "../../hooks/use-mobile"
import { Avatar, AvatarFallback } from "../../components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { useRouter, useSearchParams } from "next/navigation"
import {
  supabase,
  type User as DbUser, // Renaming to avoid conflict with component's User type if any
  type AvailabilityRecord,
  type FavoriteRecord,
  type MessageRecord,
  type ResponseRecord,
  type Instance as DbInstance // Import Instance type from Supabase
} from "../../lib/supabase"
import { toast } from "../../hooks/use-toast"
import { Alert, AlertDescription } from "../../components/ui/alert"
import { Input } from "../../components/ui/input" // Added for chat input
import { format } from "date-fns" // Added for date formatting
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../../components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { Label } from "../../components/ui/label"
import { redirect } from 'next/navigation'

// Define component-specific types (can be adjusted as needed)
interface Instance extends DbInstance {}
interface User extends DbUser {}

interface ChatMessage {
  id: string
  user_id: string
  sender: string
  content: string
  created_at: Date
}

interface UserSelectionDialogProps {
  isOpen: boolean
  onClose: () => void
  onUserSelect: (user: User) => void
  users: User[]
  instancePassword: string
}

function UserSelectionDialog({ isOpen, onClose, onUserSelect, users, instancePassword }: UserSelectionDialogProps) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) {
      setError("Please select a user")
      return
    }
    if (password !== instancePassword) {
      setError("Incorrect password")
      return
    }
    onUserSelect(selectedUser)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to the Date Picker!</DialogTitle>
          <DialogDescription>
            To get started, select your name from the list below and enter the password to mark your availability.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Your Name</Label>
            <Select value={selectedUser?.id} onValueChange={(value) => setSelectedUser(users.find(u => u.id === value) || null)}>
              <SelectTrigger>
                <SelectValue placeholder="Select your name" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter the instance password"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter>
            <Button type="submit">Continue</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function InstancePage({ params }: { params: Promise<{ instanceId: string }> }) {
  const unwrappedParams = use(params)
  const instanceId = unwrappedParams.instanceId
  const router = useRouter()
  const isMobile = useMobile()
  const [isHydrated, setIsHydrated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [currentInstance, setCurrentInstance] = useState<Instance | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showUserDialog, setShowUserDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [instancePassword, setInstancePassword] = useState<string>("")
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map())
  const [isCreator, setIsCreator] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [responses, setResponses] = useState<Record<string, { hasResponded: boolean; cantAttend: boolean }>>({})
  const [availability, setAvailability] = useState<Record<string, Record<string, boolean>>>({})
  const [favoredDays, setFavoredDays] = useState<Record<string, Record<string, boolean>>>({})

  const dateRange = useMemo(() => {
    if (!currentInstance?.start_date || !currentInstance?.end_date) return []
    const dates = []
    const start = new Date(currentInstance.start_date)
    const end = new Date(currentInstance.end_date)
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      // Filter for weekdays if needed, or keep all days as per original DatePicker
      // const dayOfWeek = date.getDay();
      // if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Example: Monday-Friday
        dates.push(new Date(date))
      // }
    }
    return dates
  }, [currentInstance?.start_date, currentInstance?.end_date])

  const loadData = async () => {
    console.log("[loadData] Called with instanceId:", instanceId)
    setIsLoading(true)
    setPageError(null)
    let usersData: User[] | null = null

    try {
      console.log("[loadData] Fetching instance details...")
      // First try to fetch by UUID
      let { data: instance, error: instanceError } = await supabase
        .from("instances")
        .select("*")
        .eq("id", instanceId)
        .single()

      // If not found by UUID, try to fetch by slug
      if (instanceError) {
        console.log("[loadData] Not found by UUID, trying slug...")
        const { data: slugInstance, error: slugError } = await supabase
          .from("instances")
          .select("*")
          .eq("slug", instanceId)
          .single()

        if (slugError) {
          console.error("[loadData] Supabase error fetching instance:", slugError)
          // If instance not found, redirect to new page
          router.push('/new')
          return
        }

        instance = slugInstance
      }

      if (!instance) {
        // If instance not found, redirect to new page
        router.push('/new')
        return
      }

      console.log("[loadData] Instance details:", instance)
      setCurrentInstance(instance as Instance)
      setInstancePassword(instance.password)

      // After fetching instance, check if current user is creator
      const { data: { user } } = await supabase.auth.getUser()
      setIsCreator(user?.id === instance.created_by)

      console.log("[loadData] Fetching users for instance...")
      // Load users for this instance
      const { data: fetchedUsers, error: usersError } = await supabase
        .from("users")
        .select("*")
        .eq("instance_id", instance.id)

      if (usersError) {
        console.error("[loadData] Supabase error fetching users:", usersError)
        throw usersError
      }

      usersData = fetchedUsers as User[]
      console.log("[loadData] Fetched usersData:", usersData)
      setUsers(usersData)

      const newUserMap = new Map<string, string>()
      usersData.forEach((user: User) => {
        newUserMap.set(user.id, user.name)
      })
      setUserMap(newUserMap)
      console.log("[loadData] User map created:", newUserMap)

      // Initialize availability, favored days, and responses state
      const newAvailability: Record<string, Record<string, boolean>> = {}
      const newFavoredDays: Record<string, Record<string, boolean>> = {}
      const newResponses: Record<string, { hasResponded: boolean; cantAttend: boolean }> = {}
      
      // Calculate currentDates directly from the fetched instanceData
      const currentDates: Date[] = []
      if (instance.start_date && instance.end_date) {
        const start = new Date(instance.start_date)
        const end = new Date(instance.end_date)
        for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
          currentDates.push(new Date(date))
        }
      }
      console.log("[loadData] Calculated currentDates directly:", currentDates)

      usersData.forEach((user: User) => {
        newAvailability[user.id] = currentDates.reduce(
          (days, date) => {
            days[date.toISOString()] = false
            return days
          },
          {} as Record<string, boolean>,
        )
        newFavoredDays[user.id] = currentDates.reduce(
          (days, date) => {
            days[date.toISOString()] = false
            return days
          },
          {} as Record<string, boolean>,
        )
        newResponses[user.id] = { hasResponded: false, cantAttend: false }
      })

      setAvailability(newAvailability)
      setFavoredDays(newFavoredDays)
      setResponses(newResponses)
      console.log("[loadData] Initialized availability, favoredDays, responses.")

      // Load availability data for users of this instance
      const userIds = usersData.map((user) => user.id)
      if (userIds.length > 0) {
        console.log(`[loadData] Fetching availability, favorites, responses, messages for userIds: ${JSON.stringify(userIds)} within instanceId: ${instanceId}`)
        const { data: availabilityData, error: availabilityError } = await supabase
          .from("availability")
          .select("*")
          .in("user_id", userIds)
          .eq("instance_id", instance.id)

        if (availabilityError) {
          console.error("[loadData] Supabase error fetching availability:", availabilityError)
          throw availabilityError
        }
        console.log("[loadData] Fetched availabilityData:", availabilityData)
        availabilityData.forEach((record: AvailabilityRecord) => {
          const dateKeyForRecord = new Date(record.date).toISOString()
          console.log(`[loadData] Processing availability record: user_id=${record.user_id}, db_date=${record.date}, as_iso_key=${dateKeyForRecord}, is_available=${record.is_available}`)
          if (newAvailability[record.user_id]) {
            if (newAvailability[record.user_id].hasOwnProperty(dateKeyForRecord)) {
              newAvailability[record.user_id][dateKeyForRecord] = record.is_available
            } else {
              console.warn(`[loadData] Date key ${dateKeyForRecord} (from db_date ${record.date}) not found in pre-initialized newAvailability for user ${record.user_id}. This might indicate a date mismatch if dates are not aligning to UTC midnight in keys.`)
            }
          }
        })
        setAvailability({...newAvailability})

        const { data: favoritesData, error: favoritesError } = await supabase
          .from("favorites")
          .select("*")
          .in("user_id", userIds)
          .eq("instance_id", instance.id)

        if (favoritesError) {
          console.error("[loadData] Supabase error fetching favorites:", favoritesError)
          throw favoritesError
        }
        console.log("[loadData] Fetched favoritesData:", favoritesData)
        favoritesData.forEach((record: FavoriteRecord) => {
          const dateKeyForRecord = new Date(record.date).toISOString()
          console.log(`[loadData] Processing favorite record: user_id=${record.user_id}, db_date=${record.date}, as_iso_key=${dateKeyForRecord}, is_favorite=${record.is_favorite}`)
          if (newFavoredDays[record.user_id]) {
            if (newFavoredDays[record.user_id].hasOwnProperty(dateKeyForRecord)) {
              newFavoredDays[record.user_id][dateKeyForRecord] = record.is_favorite
            } else {
              console.warn(`[loadData] Date key ${dateKeyForRecord} (from db_date ${record.date}) not found in pre-initialized newFavoredDays for user ${record.user_id}.`)
            }
          } else {
            console.warn(`[loadData] User ID ${record.user_id} from favoritesData not found in pre-initialized newFavoredDays. Initializing now.`)
            newFavoredDays[record.user_id] = { [dateKeyForRecord]: record.is_favorite }
          }
        })
        setFavoredDays({ ...newFavoredDays })
        console.log("[loadData] FavoredDays state updated with fetched data:", newFavoredDays)

        const { data: responsesData, error: responsesError } = await supabase
          .from("responses")
          .select("*")
          .in("user_id", userIds)
          .eq("instance_id", instance.id)

        if (responsesError) {
          console.error("[loadData] Supabase error fetching responses:", responsesError)
          throw responsesError
        }
        console.log("[loadData] Fetched responsesData:", responsesData)
        responsesData.forEach((record: ResponseRecord) => {
          if (newResponses[record.user_id]) {
            newResponses[record.user_id] = {
              hasResponded: record.has_responded,
              cantAttend: record.cant_attend,
            }
          }
        })
        setResponses({...newResponses})

        // Fetch messages for this instance
        const { data: messagesData, error: messagesError } = await supabase
          .from("messages")
          .select("*, user:users!inner(name)")
          .eq("instance_id", instance.id)
          .order("created_at", { ascending: true })

        if (messagesError) {
          console.error("[loadData] Supabase error fetching messages:", messagesError)
          throw messagesError
        }
        console.log("[loadData] Fetched messagesData:", messagesData)

        if (messagesData) {
          const chatMessages: ChatMessage[] = messagesData.map((record: any) => ({
            id: record.id,
            user_id: record.user_id,
            sender: record.user?.name || userMap.get(record.user_id) || "Unknown",
            content: record.content,
            created_at: record.created_at ? new Date(record.created_at) : new Date(),
          }))
          setMessages(chatMessages)
          console.log("[loadData] Processed chatMessages:", chatMessages)
        } else {
          setMessages([])
          console.log("[loadData] No messages found or messagesData is null.")
        }
      } else {
        console.log("[loadData] No users found for this instance, skipping related data fetch.")
      }
    } catch (error: any) {
      console.error("[loadData] Catch block error:", error)
      // If there's an error, redirect to new page
      router.push('/new')
      return
    } finally {
      setIsLoading(false)
      // Use usersData from the outer scope for the most up-to-date length
      console.log("[loadData] Finally block. isLoading: false. selectedUserId:", selectedUser, "fetched usersData.length:", usersData?.length ?? 0, "pageError:", pageError)
      if (!selectedUser && usersData && usersData.length > 0 && !pageError) {
        console.log("[loadData] Showing user dialog because users were fetched and no user is selected.")
        setShowUserDialog(true)
      } else {
        console.log("[loadData] Not showing user dialog. Conditions: !selectedUserId:", !selectedUser, "fetched usersData.length > 0:", (usersData?.length ?? 0) > 0, "!pageError:", !pageError)
      }
    }
  }

  useEffect(() => {
    if (instanceId) { // Changed condition: Call loadData if instanceId is present
        loadData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]) // Changed dependency array: Only instanceId

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    // Real-time subscription for messages
    if (!instanceId || users.length === 0) return; // Don't subscribe if no instanceId or users for context

    const messagesSubscription = supabase
      .channel(`messages-instance-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `instance_id=eq.${instanceId}` // Server-side filter
        },
        (payload) => {
          const newMessage = payload.new as MessageRecord
          if (userMap.has(newMessage.user_id)) { // Check if sender is in current user list
            setMessages((prev) => [
              ...prev,
              {
                id: newMessage.id.toString(),
                user_id: newMessage.user_id,
                sender: userMap.get(newMessage.user_id) || "Unknown",
                content: newMessage.content,
                created_at: new Date(newMessage.created_at), // Changed from timestamp
              },
            ])
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(messagesSubscription)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, userMap]) // userMap dependency ensures it re-subscribes if users change

  const toggleAvailability = async (userId: string, dateKey: string) => {
    if (userId !== selectedUser?.id) return

    try {
      const authUserResponse = await supabase.auth.getUser();
      console.log("[toggleAvailability] Current auth user:", authUserResponse?.data?.user);
      console.log("[toggleAvailability] Attempting to modify for userId (selectedUserId):", userId, "for dateKey:", dateKey);
      console.log("[toggleAvailability] Using instanceId:", currentInstance?.id);
    } catch (e) {
      console.error("[toggleAvailability] Error fetching auth user:", e);
    }

    const newValue = !availability[userId]?.[dateKey]
    console.log(`[toggleAvailability] User ${userId}, Date ${dateKey}, Current Value: ${availability[userId]?.[dateKey]}, New Value: ${newValue}`);

    // Optimistic update (already there)
    setAvailability((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] || {}), [dateKey]: newValue },
    }))

    try {
      console.log("[toggleAvailability] Checking for existing record...");
      const { data: existingRecord, error: checkError } = await supabase
        .from("availability")
        .select("id")
        .eq("user_id", userId)
        .eq("date", dateKey) 
        .eq("instance_id", currentInstance?.id)
        .single()

      console.log("[toggleAvailability] Existing record check result:", { existingRecord, checkError });

      if (checkError && checkError.code !== "PGRST116") { // PGRST116: 'JSON object requested, multiple (or no) rows returned'
        console.error("[toggleAvailability] Error checking for existing record (and not PGRST116):", checkError);
        throw checkError
      }

      if (existingRecord) {
        console.log(`[toggleAvailability] Updating existing record ID: ${existingRecord.id} to is_available: ${newValue}`);
        const { data: updateData, error: updateError } = await supabase
          .from("availability").update({ is_available: newValue, updated_at: new Date().toISOString() }).eq("id", existingRecord.id).select();
        console.log("[toggleAvailability] Update result:", { updateData, updateError });
        if (updateError) throw updateError
      } else {
        console.log(`[toggleAvailability] Inserting new record: user_id: ${userId}, date: ${dateKey}, is_available: ${newValue}, instance_id: ${currentInstance?.id}`);
        const { data: insertData, error: insertError } = await supabase.from("availability").insert({
          user_id: userId, 
          date: dateKey, 
          is_available: newValue, 
          instance_id: currentInstance?.id,
          updated_at: new Date().toISOString(), 
        }).select();
        console.log("[toggleAvailability] Insert result:", { insertData, insertError });
        if (insertError) throw insertError
      }

      // If unchecking availability, also uncheck favored (already there)
      if (!newValue && favoredDays[userId]?.[dateKey]) {
        console.log("[toggleAvailability] Availability unchecked, also unchecking favored for this date.");
        // Not awaiting this separately, assuming toggleFavored handles its own errors/state.
        toggleFavored(userId, dateKey) 
      }
      
      // Update user's response status (already there)
      let hasAnyAvailableDates = false
      if (!newValue) { // Check if any other date is still available for this user
        for (const date of dateRange) {
          const key = date.toISOString()
          if (key === dateKey) continue // Don't count the one we just changed
          if (availability[userId]?.[key]) { hasAnyAvailableDates = true; break }
        }
      } else { // If newValue is true, then they have at least this one available date
        hasAnyAvailableDates = true;
      }
      console.log(`[toggleAvailability] Updating user response. Has available dates: ${hasAnyAvailableDates}`);
      await updateUserResponse(userId, newValue || hasAnyAvailableDates, responses[userId]?.cantAttend || false)
      console.log("[toggleAvailability] Successfully updated/inserted availability and user response.");

    } catch (error) {
      console.error("[toggleAvailability] Error in Supabase operation or subsequent logic:", error)
      // Revert optimistic update
      setAvailability((prev) => ({
        ...prev, [userId]: { ...(prev[userId] || {}), [dateKey]: !newValue },
      }))
      toast({ title: "Error", description: "Failed to update availability. Please try again.", variant: "destructive" })
    }
  }

  const toggleFavored = async (userId: string, dateKey: string) => {
    if (userId !== selectedUser?.id || !availability[userId]?.[dateKey]) {
      console.warn(`[toggleFavored] Aborted: User ${userId} (selected: ${selectedUser?.id}) or date ${dateKey} not available.`);
      // Maybe provide feedback to user if they somehow click a disabled star
      if (userId === selectedUser?.id && !availability[userId]?.[dateKey]) {
        toast({ title: "Info", description: "You must mark this day as available before favoriting.", variant: "default" });
      }
      return;
    }

    console.log(`[toggleFavored] User ${userId}, Date ${dateKey}, Current favored: ${favoredDays[userId]?.[dateKey]}`);
    const newValue = !favoredDays[userId]?.[dateKey];
    console.log(`[toggleFavored] New favored value: ${newValue}`);

    // Optimistic update
    setFavoredDays((prev) => ({
      ...prev, [userId]: { ...(prev[userId] || {}), [dateKey]: newValue },
    }));

    try {
      console.log("[toggleFavored] Checking for existing favorite record...");
      const { data: existingRecord, error: checkError } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", userId)
        .eq("date", dateKey) // Using ISOString dateKey as the value for 'date' column
        .eq("instance_id", currentInstance?.id)
        .single();

      console.log("[toggleFavored] Existing favorite record check result:", { existingRecord, checkError });

      if (checkError && checkError.code !== "PGRST116") {
        console.error("[toggleFavored] Error checking for existing record (and not PGRST116):", checkError);
        throw checkError;
      }

      if (existingRecord) {
        console.log(`[toggleFavored] Updating existing favorite record ID: ${existingRecord.id} to is_favorite: ${newValue}`);
        const { data: updateData, error: updateError } = await supabase
          .from("favorites")
          .update({ is_favorite: newValue, updated_at: new Date().toISOString() })
          .eq("id", existingRecord.id)
          .select();
        console.log("[toggleFavored] Update result:", { updateData, updateError });
        if (updateError) throw updateError;
      } else {
        console.log(`[toggleFavored] Inserting new favorite record: user_id: ${userId}, date: ${dateKey}, is_favorite: ${newValue}, instance_id: ${currentInstance?.id}`);
        const { data: insertData, error: insertError } = await supabase
          .from("favorites")
          .insert({
            user_id: userId, 
            date: dateKey, // This is the ISO string. Your DB 'date' column should handle this or be 'text'. If it's 'date' type, this might be an issue.
            is_favorite: newValue, 
            instance_id: currentInstance?.id, 
            updated_at: new Date().toISOString(),
          })
          .select();
        console.log("[toggleFavored] Insert result:", { insertData, insertError });
        if (insertError) throw insertError;
      }
      
      // Update user response: if they favorite something, they have responded.
      // This assumes that if they un-favorite all, they might still be 'responded' if they have available days.
      // The main response update logic is better handled in toggleAvailability or a dedicated function.
      // For now, just ensure they are marked as responded if they make a positive favorite action.
      if (newValue && (!responses[userId] || !responses[userId].hasResponded)) {
        console.log("[toggleFavored] User has favorited a day, ensuring they are marked as responded.");
        await updateUserResponse(userId, true, responses[userId]?.cantAttend || false);
      }
      console.log("[toggleFavored] Successfully updated/inserted favorite.");

    } catch (error) {
      console.error("[toggleFavored] Error in Supabase operation:", error);
      // Revert optimistic update
      setFavoredDays((prev) => ({ ...prev, [userId]: { ...(prev[userId] || {}), [dateKey]: !newValue } }));
      toast({ title: "Error", description: "Failed to update favorite status. Please try again.", variant: "destructive" });
    }
  }

  const setAllAvailability = async (userId: string, value: boolean) => {
    if (userId !== selectedUser?.id) {
      console.warn("[setAllAvailability] Aborted: userId does not match selectedUserId.");
      return;
    }
    console.log(`[setAllAvailability] Called for user ${userId}, value: ${value}, instanceId: ${currentInstance?.id}`);
    setIsLoading(true);

    // Store previous state for potential revert
    const prevAvailability = JSON.parse(JSON.stringify(availability));
    const prevFavoredDays = JSON.parse(JSON.stringify(favoredDays));
    const prevResponses = JSON.parse(JSON.stringify(responses)); // Assuming responses might change

    // Optimistic UI update
    const updatedAvailability = { ...availability };
    if (!updatedAvailability[userId]) updatedAvailability[userId] = {};
    const updatedFavoredDays = { ...favoredDays };
    if (!updatedFavoredDays[userId]) updatedFavoredDays[userId] = {};

    dateRange.forEach(date => {
      const dateKey = date.toISOString();
      updatedAvailability[userId][dateKey] = value;
      if (!value) { // If marking all unavailable, also unmark favorites
        updatedFavoredDays[userId][dateKey] = false;
      }
    });
    setAvailability(updatedAvailability);
    setFavoredDays(updatedFavoredDays);
    console.log("[setAllAvailability] Optimistic UI updates applied.");

    try {
      if (!value) { // Marking all as UNAVAILABLE
        console.log(`[setAllAvailability] Deleting all availability and favorites for user ${userId}`);
        const { error: deleteAvailError } = await supabase
          .from("availability")
          .delete()
          .eq("user_id", userId)
          .eq("instance_id", currentInstance?.id);
        if (deleteAvailError) throw deleteAvailError;
        console.log("[setAllAvailability] Availability delete successful.");

        const { error: deleteFavError } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", userId)
          .eq("instance_id", currentInstance?.id);
        if (deleteFavError) throw deleteFavError;
        console.log("[setAllAvailability] Favorites delete successful.");
        
        await updateUserResponse(userId, false, false); // Reset response state

      } else { // Marking all as AVAILABLE
        console.log(`[setAllAvailability] Upserting all availability to TRUE for user ${userId}`);
        const upsertOps = dateRange.map(date => {
          const dateKey = date.toISOString();
          return supabase.from("availability").upsert(
            {
              user_id: userId,
              date: dateKey, // DB `date` column is TEXT for ISO string
              is_available: true,
              instance_id: currentInstance?.id,
              // `created_at` is handled by DB default, `updated_at` will be set by DB trigger or here
              updated_at: new Date().toISOString(), 
            },
            { onConflict: 'user_id,date,instance_id' }
          ).select(); // .select() to confirm and get data back
        });

        const results = await Promise.all(upsertOps);
        results.forEach(result => {
          if (result.error) {
            console.error("[setAllAvailability] Error in one of the upsert operations:", result.error);
            throw result.error; // Throw the first error to be caught by the main catch block
          }
        });
        console.log("[setAllAvailability] All availability upserts successful.");
        await updateUserResponse(userId, true, false); // Mark as responded
      }

      toast({ title: "Success", description: value ? "All days marked as available" : "All days marked as unavailable" });
    } catch (error: any) {
      console.error("[setAllAvailability] Error during database operations:", error);
      toast({ title: "Error", description: `Failed to update all availability: ${error.message}` });
      // Revert optimistic updates
      console.log("[setAllAvailability] Reverting optimistic UI updates due to error.");
      setAvailability(prevAvailability);
      setFavoredDays(prevFavoredDays);
      setResponses(prevResponses); // Revert responses as well
    } finally {
      setIsLoading(false);
      console.log("[setAllAvailability] Operation finished.");
    }
  };

  const updateUserResponse = async (userId: string, hasResponded: boolean, cantAttend: boolean) => {
    try {
      setResponses((prev) => ({ ...prev, [userId]: { hasResponded, cantAttend } }))
      await supabase.from("responses").upsert({ 
          user_id: userId,
          has_responded: hasResponded,
          cant_attend: cantAttend,
        instance_id: currentInstance?.id, 
        updated_at: new Date().toISOString() 
      }, { onConflict: 'user_id,instance_id' })
    } catch (error) {
      console.error("Error updating response status:", error)
      toast({ title: "Error", description: "Failed to update response status.", variant: "destructive" })
    }
  }

  const toggleCantAttend = async (userId: string) => {
    if (userId !== selectedUser?.id) return
    const newValue = !responses[userId]?.cantAttend
      setIsLoading(true)
    try {
      if (newValue) {
        const newAvail = { ...availability }
        const newFav = { ...favoredDays }
        dateRange.forEach(date => {
          const dateKey = date.toISOString()
          newAvail[userId][dateKey] = false
          newFav[userId][dateKey] = false
        })
        setAvailability(newAvail)
        setFavoredDays(newFav)
        await supabase.from("availability").delete().eq("user_id", userId).eq("instance_id", currentInstance?.id)
        await supabase.from("favorites").delete().eq("user_id", userId).eq("instance_id", currentInstance?.id)
      }
      await updateUserResponse(userId, true, newValue)
      toast({ title: "Success", description: newValue ? "Marked as unable to attend" : "You can now select dates" })
    } catch (error) {
      console.error("Error updating cant attend status:", error)
      toast({ title: "Error", description: "Failed to update attendance status.", variant: "destructive" })
    } finally { setIsLoading(false) }
  }

  const getBestDays = () => {
    if (users.length === 0 || dateRange.length === 0) return []
    const dayCounts = dateRange.map((date) => {
      const dateKey = date.toISOString()
      const availableCount = users.filter(user => availability[user.id]?.[dateKey] && !responses[user.id]?.cantAttend).length
      const favoredCount = users.filter(user => availability[user.id]?.[dateKey] && favoredDays[user.id]?.[dateKey] && !responses[user.id]?.cantAttend).length
      return { date, availableCount, favoredCount, score: availableCount + favoredCount * 0.5 }
    })
    const availableDays = dayCounts.filter(d => d.availableCount > 0)
    if (availableDays.length === 0) return []
    const daysByScore = availableDays.reduce((acc, day) => {
      if (!acc[day.score]) acc[day.score] = []
      acc[day.score].push(day)
      return acc
    }, {} as Record<number, typeof availableDays>)
    const sortedScores = Object.keys(daysByScore).map(Number).sort((a, b) => b - a)
    const topScores = sortedScores.slice(0, 3)
    return topScores.map(score => ({ score, days: daysByScore[score].map(d => ({ date: d.date, availableCount: d.availableCount, favoredCount: d.favoredCount, respondedCount: getRespondedCount() }))}))
  }

  const getRespondedCount = () => users.filter(user => responses[user.id]?.hasResponded).length
  const getCantAttendUsers = () => users.filter(user => responses[user.id]?.cantAttend)
  const formatDateMobile = (date: Date) => date.toLocaleDateString("sv-SE", { day: "numeric", month: "numeric" })
  const formatWeekdayMobile = (date: Date) => date.toLocaleDateString("sv-SE", { weekday: "short" }).substring(0, 2)
  const getInitials = (name: string) => name?.charAt(0)?.toUpperCase() || ''
  const getAvatarColor = (name: string = '') => {
    const colors = ["bg-red-100 text-red-800", "bg-blue-100 text-blue-800", "bg-green-100 text-green-800", "bg-yellow-100 text-yellow-800", "bg-purple-100 text-purple-800"]
    const index = (name?.length || 0) % colors.length
    return colors[index]
  }
  const getSortedUsers = (userList: User[], selectedId: string | null): User[] => {
    if (!selectedId) return userList
    return [...userList.filter(user => user.id === selectedId), ...userList.filter(user => user.id !== selectedId)]
  }

  const handleUserSelect = (user: User) => {
    setSelectedUser(user)
    setShowUserDialog(false)
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedUser || !currentInstance) return

    const messageText = newMessage.trim()
    setNewMessage("") // Clear input immediately

    // Optimistically update UI
    const optimisticMessage: ChatMessage = {
      id: Math.random().toString(), // Temporary ID
      user_id: selectedUser.id,
      sender: selectedUser.name || "You",
      content: messageText,
      created_at: new Date(),
    }
    setMessages((prevMessages) => [...prevMessages, optimisticMessage])

    try {
      const { data, error } = await supabase.from("messages").insert([
        {
          instance_id: currentInstance.id,
          user_id: selectedUser.id,
          content: messageText,
          // created_at is handled by the database default (TIMESTAMPTZ DEFAULT now())
          // No need to send created_at if your DB column has a default value like now() or CURRENT_TIMESTAMP
        },
      ]).select("*, user:users!inner(name)") // Re-fetch to get actual created_at and user name

  if (error) {
        console.error("Error sending message:", error)
        toast({
          title: "Error",
          description: "Failed to send message: " + error.message,
          variant: "destructive",
        })
        // Revert optimistic update
        setMessages((prevMessages) => prevMessages.filter((msg) => msg.id !== optimisticMessage.id))
        setNewMessage(messageText); // Restore message to input
      } else if (data && data.length > 0) {
        // Replace optimistic message with actual message from DB
        const savedMessage = data[0];
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === optimisticMessage.id
              ? {
                  id: savedMessage.id,
                  user_id: savedMessage.user_id,
                  sender: savedMessage.user?.name || userMap.get(savedMessage.user_id) || "Unknown",
                  content: savedMessage.content,
                  created_at: new Date(savedMessage.created_at),
                }
              : msg,
          ),
        )
      }
    } catch (e: any) {
      console.error("Exception sending message:", e)
      toast({
        title: "Error",
        description: "An unexpected error occurred while sending the message.",
        variant: "destructive",
      })
      // Revert optimistic update
      setMessages((prevMessages) => prevMessages.filter((msg) => msg.id !== optimisticMessage.id))
      setNewMessage(messageText); // Restore message to input
    }
  }

  const formatMessageTime = (date: Date) => date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  const handleDeleteInstance = async () => {
    if (!currentInstance) return

    try {
      const { error } = await supabase
        .from("instances")
        .delete()
        .eq("id", currentInstance.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Instance deleted successfully",
      })

      router.push("/new")
    } catch (error) {
      console.error("Error deleting instance:", error)
      toast({
        title: "Error",
        description: "Failed to delete instance",
        variant: "destructive",
      })
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied!",
      description: "Text copied to clipboard",
    })
  }

  if (!isHydrated) return null
  if (pageError) return (
      <div className="flex min-h-screen items-center justify-center p-4">
          <Alert variant="destructive" className="max-w-md"><AlertDescription>{pageError}</AlertDescription></Alert>
      </div>
  )
  // Show full page loader if instance is not yet loaded, or if initial data load is in progress
  if (!currentInstance || (isLoading && users.length === 0)) return (
    <div className="min-h-screen bg-[#f9f5f3] flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading data...</p>
        </div>
      </div>
    )

    return (
      <div className="min-h-screen bg-[#f9f5f3]">
        {isHydrated && (
          <>
            <UserSelectionDialog
              isOpen={showUserDialog}
              onClose={() => setShowUserDialog(false)}
              onUserSelect={handleUserSelect}
              users={users}
              instancePassword={instancePassword}
            />
            <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Share this date picker</DialogTitle>
                  <DialogDescription>
                    Copy this message to share with your participants
                  </DialogDescription>
                </DialogHeader>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm whitespace-pre-line">
                    {`Hey! I've created a date picker for us to find the best time to meet.

You can access it here:
https://date-booker.vercel.app/${instanceId}

Password: ${instancePassword}

Please add your availability and I'll coordinate the best time for everyone!`}
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      const message = `Hey! I've created a date picker for us to find the best time to meet.

You can access it here:
https://date-booker.vercel.app/${instanceId}

Password: ${instancePassword}

Please add your availability and I'll coordinate the best time for everyone!`
                      navigator.clipboard.writeText(message)
                      toast({
                        title: "Copied!",
                        description: "Message copied to clipboard",
                      })
                    }}
                  >
                    Copy Message
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
        <div className={`container mx-auto py-6 px-4 ${showUserDialog ? 'invisible' : ''}`}>
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl md:text-3xl font-bold">{currentInstance?.name || 'Date Picker'}</h1>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowShareDialog(true)}
                className="flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Share Message
              </Button>
              {isCreator && currentInstance && (
                <>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(window.location.href)}
                      className="flex items-center gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      Copy URL
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(currentInstance.password)}
                      className="flex items-center gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      Copy Password
                    </Button>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">Delete Instance</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the instance
                          and all associated data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteInstance}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </div>

          {isLoading && users.length > 0 && (
             <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
          )}

            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 p-4 md:p-6">
              {selectedUser ? (
                  <div className="flex items-center gap-3 mb-3">
                  <Avatar className={`h-10 w-10 ${getAvatarColor(selectedUser.name)}`}>
                    <AvatarFallback>{getInitials(selectedUser.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                    <h2 className="text-xl font-semibold">{selectedUser.name}</h2>
                    <p className="text-sm text-gray-600">Select your name to view and mark dates.</p>
                    </div>
                  <Button variant="outline" size="sm" className="ml-auto" onClick={() => setShowUserDialog(true)} disabled={isLoading}>Select user</Button>
                  </div>
                ) : (
                <p className="text-sm md:text-base text-gray-600">Select your name to view and mark dates.</p>
                )}
                <div className="flex flex-col md:flex-row md:items-center gap-2 text-sm text-gray-500">
                <div className="flex items-center gap-1"><Checkbox className="data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500" checked={true} disabled /><span>Available</span></div>
                <div className="flex items-center gap-1"><Star className="h-4 w-4 fill-red-500 text-red-500" /><span>Favorite day</span></div>
                </div>
              </div>

              <Tabs defaultValue="availability" className="w-full">
                <TabsList className="w-full border-b rounded-none bg-white px-4 md:px-6">
                <TabsTrigger value="availability" className="flex-1 data-[state=active]:text-red-500">Availability</TabsTrigger>
                <TabsTrigger value="chat" className="flex-1 data-[state=active]:text-red-500">Discuss here</TabsTrigger>
                </TabsList>

                <TabsContent value="availability" className="p-4 md:p-6">
                {selectedUser ? (
                  <>
                    <div className="mb-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="cant-attend" checked={responses[selectedUser.id]?.cantAttend || false} onCheckedChange={() => toggleCantAttend(selectedUser.id)} disabled={isLoading} className="data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500" />
                        <label htmlFor="cant-attend" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">I cannot attend any of these days</label>
                      </div>
                    </div>
                    {responses[selectedUser.id]?.cantAttend && (
                      <Alert className="mb-6 bg-red-50 border-red-200"><AlertDescription className="flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" /><span>You have marked that you cannot attend.</span></AlertDescription></Alert>
                    )}
                    <div className="md:hidden mb-6">
                      {getSortedUsers(users, selectedUser.id).map((user) => {
              <TabsContent value="availability" className="p-4 md:p-6">
              {selectedUser ? (
                <>
                  <div className="mb-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="cant-attend" checked={responses[selectedUser.id]?.cantAttend || false} onCheckedChange={() => toggleCantAttend(selectedUser.id)} disabled={isLoading} className="data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500" />
                      <label htmlFor="cant-attend" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">I cannot attend any of these days</label>
                    </div>
                  </div>
                  {responses[selectedUser.id]?.cantAttend && (
                    <Alert className="mb-6 bg-red-50 border-red-200"><AlertDescription className="flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" /><span>You have marked that you cannot attend.</span></AlertDescription></Alert>
                  )}
                  <div className="md:hidden mb-6">
                    {getSortedUsers(users, selectedUser.id).map((user) => {
                      const isCurrentUser = user.id === selectedUser.id;
                      const cantAttend = responses[user.id]?.cantAttend;
                      return (
                        <div key={user.id} className={`mb-6 p-3 rounded-lg ${isCurrentUser ? "bg-white shadow-sm" : "bg-gray-50 border"}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Avatar className={`h-6 w-6 ${getAvatarColor(user.name)}`}><AvatarFallback>{getInitials(user.name)}</AvatarFallback></Avatar>
                              <h3 className="font-medium">{user.name}</h3>
                              {isCurrentUser && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">Du</span>}
                            </div>
                            {isCurrentUser && !cantAttend && (
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={() => setAllAvailability(user.id, true)} disabled={isLoading}><PlusCircle className="h-4 w-4 text-green-500" /><span>All</span></Button>
                                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={() => setAllAvailability(user.id, false)} disabled={isLoading}><MinusCircle className="h-4 w-4 text-red-500" /><span>None</span></Button>
                          </div>
                            )}
                                  </div>
                          <div className="grid grid-cols-3 gap-2">
                            {dateRange.map((date) => {
                              const dateKey = date.toISOString();
                              const isAvailable = availability[user.id]?.[dateKey];
                              const isFavored = favoredDays[user.id]?.[dateKey];
                              return (
                                <div key={`${user.id}-${dateKey}-mobile`} className="flex flex-col items-center border rounded-lg p-2">
                                  <div className="text-xs font-medium text-gray-500">{formatWeekdayMobile(date)}</div>
                                  <div className="text-sm mb-1">{formatDateMobile(date)}</div>
                                  <div className="flex flex-col items-center gap-1">
                                    {cantAttend && !isCurrentUser ? (
                                        <XCircle className="h-4 w-4 text-gray-300" />
                                    ) : cantAttend && isCurrentUser ? (
                                      <XCircle className="h-4 w-4 text-red-300" />
                                    ) : (
                                      <>
                                        <Checkbox checked={isAvailable} onCheckedChange={() => { toggleAvailability(user.id, dateKey); if (isAvailable && isFavored) toggleFavored(user.id, dateKey);}} className="data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500 h-5 w-5" disabled={!isCurrentUser || isLoading} />
                                        <button onClick={() => toggleFavored(user.id, dateKey)} disabled={!isAvailable || !isCurrentUser || isLoading} className={`flex items-center justify-center h-6 w-6 rounded-full ${!isAvailable || !isCurrentUser ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}>
                                          <Star className={`h-5 w-5 ${isFavored && isAvailable ? "fill-red-500 text-red-500" : "text-gray-400"}`} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full table-auto border-collapse">
                      <thead>
                        <tr>
                          <th className="text-left p-2 font-medium text-gray-500 border-b">Participants</th>
                          <th className="text-center p-2 font-medium text-gray-500 border-b">Actions</th>
                          {dateRange.map((date) => (
                            <th key={date.toISOString()} className="text-center p-2 font-medium text-gray-500 border-b">
                              <div className="text-center">
                                <div className="text-xs font-medium text-gray-500">{date.toLocaleDateString("sv-SE", { weekday: "short" })}</div>
                                <div className="text-sm">{date.toLocaleDateString("sv-SE", { day: "numeric", month: "numeric" })}</div>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {getSortedUsers(users, selectedUser.id).map((user) => {
                          const isCurrentUser = user.id === selectedUser.id;
                          const cantAttend = responses[user.id]?.cantAttend;
                          return (
                            <tr key={user.id} className={`border-b border-gray-100 ${isCurrentUser ? "bg-white" : "bg-gray-50"}`}>
                              <td className="p-2 font-medium text-left">
                                <div className="flex items-center gap-2">
                                  <Avatar className={`h-6 w-6 ${getAvatarColor(user.name)}`}><AvatarFallback>{getInitials(user.name)}</AvatarFallback></Avatar>
                                  {user.name}
                                  {isCurrentUser && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">Du</span>}
                                  </div>
                              </td>
                              <td className="p-2 text-center">
                                {!cantAttend && (
                                  <div className="flex justify-center gap-2">
                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setAllAvailability(user.id, true)} disabled={!isCurrentUser || isLoading}><PlusCircle className={`h-4 w-4 ${isCurrentUser ? "text-green-500" : "text-gray-300"}`} /><span className="sr-only">Mark all</span></Button>
                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setAllAvailability(user.id, false)} disabled={!isCurrentUser || isLoading}><MinusCircle className={`h-4 w-4 ${isCurrentUser ? "text-red-500" : "text-gray-300"}`} /><span className="sr-only">Unmark all</span></Button>
                                </div>
                                )}
                              </td>
                              {dateRange.map((date) => {
                                const dateKey = date.toISOString();
                                const isAvailable = availability[user.id]?.[dateKey];
                                const isFavored = favoredDays[user.id]?.[dateKey];
                                return (
                                  <td key={`${user.id}-${dateKey}`} className="p-2 text-center">
                                    {cantAttend && !isCurrentUser ? (
                                        <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                                    ) : cantAttend && isCurrentUser ? (
                                      <XCircle className="h-4 w-4 text-red-300 mx-auto" />
                                    ) : (
                                      <div className="flex flex-col items-center">
                                        <Checkbox checked={isAvailable} onCheckedChange={() => { toggleAvailability(user.id, dateKey); if (isAvailable && isFavored) toggleFavored(user.id, dateKey);}} className={`data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500 ${!isCurrentUser ? "opacity-60" : ""}`} disabled={!isCurrentUser || isLoading} />
                                        <button onClick={() => toggleFavored(user.id, dateKey)} disabled={!isAvailable || !isCurrentUser || isLoading} className={`flex items-center justify-center h-6 w-6 rounded-full ${!isAvailable || !isCurrentUser ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}>
                                          <Star className={`h-5 w-5 ${isFavored && isAvailable ? "fill-red-500 text-red-500" : "text-gray-400"}`} />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-gray-500">Select a user to view availability.</p>
                )}
              </TabsContent>

              <TabsContent value="chat" className="p-4 md:p-6">
              {selectedUser ? (
                <div className="flex flex-col h-[500px]">
                  <div className="flex-1 overflow-y-auto mb-4 space-y-2">
                    {messages.map((message) => (
                      <div key={message.id} className={`flex ${message.user_id === selectedUser.id ? "justify-end" : "justify-start"}`}>
                        <div className={`p-2 rounded-lg w-fit max-w-[80%] ${message.user_id === selectedUser.id ? "bg-red-100 text-gray-800" : "bg-gray-100 text-gray-800"}`}>
                          <div className="text-xs text-gray-500">{message.sender}</div>
                          <div>{message.content}</div>
                          <div className="text-xs text-gray-500 text-right">{formatMessageTime(message.created_at)}</div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="flex items-center">
                    <Input type="text" className="flex-1 border rounded-lg py-2 px-3 mr-2 focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="Type a message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSendMessage();}} />
                    <Button onClick={handleSendMessage} disabled={isLoading || newMessage.trim() === ''}>Send</Button>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">Select a user to start chatting.</p>
              )}
              </TabsContent>
            </Tabs>
          </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Suggested best days</h2>
          {getCantAttendUsers().length > 0 && (
            <Alert className="mb-4 bg-yellow-50 border-yellow-200"><AlertDescription className="flex items-center gap-2"><XCircle className="h-4 w-4 text-yellow-500" /><span>{getCantAttendUsers().map(user => user.name).join(", ")} cannot attend.</span></AlertDescription></Alert>
          )}
          {getBestDays().length > 0 ? (
            <div className="space-y-4">
              {getBestDays().map((group, groupIndex) => (
                <div key={`group-${groupIndex}`} className="p-4 md:p-5 bg-white rounded-lg border border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    {groupIndex === 0 ? (<span className="text-sm font-medium bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Best option</span>) 
                    : groupIndex === 1 ? (<span className="text-sm font-medium bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Second best</span>)
                    : (<span className="text-sm font-medium bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full">Third best</span>)}
              </div>
                  <div className="space-y-2">
                    {group.days.map(({ date, availableCount, favoredCount, respondedCount }) => (
                      <div key={date.toISOString()} className="flex flex-col md:flex-row md:items-center md:justify-between bg-white p-3 rounded-md shadow-sm border border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{date.toLocaleDateString("sv-SE", { weekday: isMobile ? "short" : "long", day: "numeric", month: isMobile ? "numeric" : "long" })}</span>
                          <div className="flex items-center gap-1 bg-red-50 text-red-500 px-2 py-0.5 rounded-full text-xs"><Star className="h-3 w-3 fill-red-500 text-red-500" /><span>{favoredCount}</span></div>
            </div>
                        <div className="flex items-center gap-1 mt-1 md:mt-0">
                          <Users className="h-4 w-4 text-gray-400" /><span className="text-sm text-gray-600">{availableCount} of {users.length} available ({respondedCount} have responded)</span>
          </div>
        </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No suggested best days could be found based on current selections.</p>
          )}
        </div>
      </div>
    </div>
  )
} 
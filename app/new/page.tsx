"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, X, Calendar } from "lucide-react"
import { cn, hashPassword } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import CustomCalendar from "@/components/CustomCalendar"

interface User {
  id: string
  name: string
}

interface FormData {
  name: string
  password: string
  users: User[]
  newUserName: string
  startDate: Date | null
  endDate: Date | null
}

// Add function to generate slug
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric chars with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

// Add function to generate unique slug
async function generateUniqueSlug(name: string): Promise<string> {
  const baseSlug = generateSlug(name)
  let slug = baseSlug
  let counter = 1

  while (true) {
    // Check if slug exists
    const { data: existingInstance } = await supabase
      .from('instances')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!existingInstance) {
      return slug
    }

    // If exists, try with a number
    slug = `${baseSlug}-${counter}`
    counter++
  }
}

export default function NewInstance() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    name: "",
    password: "",
    users: [],
    newUserName: "",
    startDate: null,
    endDate: null,
  })
  const [startDate, setStartDate] = useState<Date | null>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(new Date(new Date().setDate(new Date().getDate() + 30)));
  const [error, setError] = useState<string | null>(null)

  // Add useEffect to sync formData with startDate/endDate
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      startDate,
      endDate
    }))
  }, [startDate, endDate])

  const addUser = () => {
    if (!formData.newUserName.trim()) return

    const newUser: User = {
      id: crypto.randomUUID(),
      name: formData.newUserName.trim(),
    }

    setFormData((prev) => ({
      ...prev,
      users: [...prev.users, newUser],
      newUserName: "",
    }))
  }

  const removeUser = (userId: string) => {
    setFormData((prev) => ({
      ...prev,
      users: prev.users.filter((user) => user.id !== userId),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      // Validate form data
      if (!formData.name.trim()) {
        throw new Error("Please enter a name for the date picker")
      }
      if (!formData.password.trim()) {
        throw new Error("Please enter a password")
      }
      if (formData.users.length === 0) {
        throw new Error("Please add at least one participant")
      }
      if (!formData.startDate || !formData.endDate) {
        throw new Error("Please select a date range")
      }

      // Generate a unique slug from the name
      const slug = await generateUniqueSlug(formData.name)

      // Create the instance
      const { data: instance, error: instanceError } = await supabase
        .from("instances")
        .insert({
          name: formData.name,
          password: formData.password,
          start_date: formData.startDate.toISOString(),
          end_date: formData.endDate.toISOString(),
          created_by: null,
          slug: slug,
        })
        .select()
        .single()

      if (instanceError) throw instanceError

      // Create users
      const { error: usersError } = await supabase.from("users").insert(
        formData.users.map((user) => ({
          name: user.name,
          instance_id: instance.id,
        }))
      )

      if (usersError) throw usersError

      // Redirect to the instance page without the password in URL
      router.push(`/${slug}`)
    } catch (error: any) {
      console.error("Error creating instance:", error)
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold mb-6">Create New Date Picker</h1>
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="Enter a name for your date picker"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Set a password for participants"
            value={formData.password}
            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
            disabled={isLoading}
            autoComplete="new-password"
          />
        </div>

        <div className="space-y-2">
          <Label>Date Range</Label>
          <div className="grid gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {startDate ? (
                    endDate ? (
                      <>
                        {format(startDate, "LLL dd, y")} -{" "}
                        {format(endDate, "LLL dd, y")}
                      </>
                    ) : (
                      format(startDate, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CustomCalendar
                  startDate={startDate}
                  endDate={endDate}
                  onRangeChange={(start, end) => {
                    setStartDate(start);
                    setEndDate(end);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="space-y-4">
          <Label>Participants</Label>
          <div className="space-y-2">
            <div className="grid gap-2">
              <Input
                placeholder="Enter participant name"
                value={formData.newUserName}
                onChange={(e) => setFormData(prev => ({ ...prev, newUserName: e.target.value }))}
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addUser()
                  }
                }}
              />
              {formData.newUserName.trim() && (
                <p className="text-sm text-muted-foreground">
                  Press Enter or click "Add Participant" to add this user
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={addUser}
                disabled={isLoading || !formData.newUserName.trim()}
                className="w-full bg-red-500 hover:bg-red-600 text-white border-red-500 hover:border-red-600"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Participant
              </Button>
            </div>
            <div className="space-y-2">
              {formData.users.map((user) => (
                <div key={user.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
                  <div className="flex flex-col">
                    <span>{user.name}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeUser(user.id)}
                    disabled={isLoading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="text-red-500 text-sm">{error}</div>
        )}

        <Button 
          type="submit" 
          className="w-full bg-green-500 hover:bg-green-600 text-white border-green-500 hover:border-green-600" 
          disabled={isLoading || formData.users.length < 2}
        >
          {isLoading ? "Creating..." : "Create Date Picker"}
        </Button>

        {formData.users.length < 2 && (
          <p className="text-sm text-gray-500 text-center">
            Please add at least 2 participants to create a date picker
          </p>
        )}

        <div className="mt-8 border-t pt-6">
          <h2 className="text-lg font-semibold mb-4">Copy this message!</h2>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className={cn(
              "text-sm transition-colors whitespace-pre-line",
              formData.name ? "text-black" : "text-gray-400"
            )}>
              {formData.name ? (
                `Hey! I've created a date picker for us to find the best time to meet.

You can access it here:
https://date-booker.vercel.app/${generateSlug(formData.name)}

Password: ${formData.password}

Please add your availability and I'll coordinate the best time for everyone!`
              ) : (
                "Your message will appear here once you enter a name and password"
              )}
            </p>
          </div>
        </div>
      </form>
    </div>
  )
} 
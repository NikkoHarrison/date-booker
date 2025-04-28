import { supabase } from "./supabase"

export async function checkDatabaseSchema() {
  console.log("Checking database schema...")

  try {
    // Check users table with more detailed logging
    const { data: usersInfo, error: usersError } = await supabase.from("users").select("*")

    if (usersError) throw usersError
    console.log("Users table data:", usersInfo)
    console.log("Users table structure:", usersInfo.length > 0 ? Object.keys(usersInfo[0]) : "No data")

    // Check availability table
    const { data: availabilityInfo, error: availabilityError } = await supabase
      .from("availability")
      .select("*")
      .limit(1)

    if (availabilityError) throw availabilityError
    console.log(
      "Availability table structure:",
      availabilityInfo.length > 0 ? Object.keys(availabilityInfo[0]) : "No data",
    )

    // Check favorites table
    const { data: favoritesInfo, error: favoritesError } = await supabase.from("favorites").select("*").limit(1)

    if (favoritesError) throw favoritesError
    console.log("Favorites table structure:", favoritesInfo.length > 0 ? Object.keys(favoritesInfo[0]) : "No data")

    // Check responses table
    const { data: responsesInfo, error: responsesError } = await supabase.from("responses").select("*").limit(1)

    if (responsesError) throw responsesError
    console.log("Responses table structure:", responsesInfo.length > 0 ? Object.keys(responsesInfo[0]) : "No data")

    // Check messages table
    const { data: messagesInfo, error: messagesError } = await supabase.from("messages").select("*").limit(1)

    if (messagesError) throw messagesError
    console.log("Messages table structure:", messagesInfo.length > 0 ? Object.keys(messagesInfo[0]) : "No data")

    // Count records in each table
    const { count: usersCount, error: usersCountError } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })

    if (usersCountError) throw usersCountError

    const { count: availabilityCount, error: availabilityCountError } = await supabase
      .from("availability")
      .select("*", { count: "exact", head: true })

    if (availabilityCountError) throw availabilityCountError

    const { count: favoritesCount, error: favoritesCountError } = await supabase
      .from("favorites")
      .select("*", { count: "exact", head: true })

    if (favoritesCountError) throw favoritesCountError

    const { count: responsesCount, error: responsesCountError } = await supabase
      .from("responses")
      .select("*", { count: "exact", head: true })

    if (responsesCountError) throw responsesCountError

    const { count: messagesCount, error: messagesCountError } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })

    if (messagesCountError) throw messagesCountError

    console.log("Record counts:", {
      users: usersCount,
      availability: availabilityCount,
      favorites: favoritesCount,
      responses: responsesCount,
      messages: messagesCount,
    })

    return "Schema check complete"
  } catch (error) {
    console.error("Error checking schema:", error)
    return "Schema check failed"
  }
}

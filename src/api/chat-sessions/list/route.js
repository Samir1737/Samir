async function handler() {
  try {
    const sessions = await sql`
      SELECT id, title, created_at, updated_at
      FROM chat_sessions
      ORDER BY updated_at DESC
    `;

    return {
      success: true,
      sessions: sessions,
    };
  } catch (error) {
    console.error("Error fetching chat sessions:", error);
    return { error: "Database error occurred while fetching chat sessions" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}

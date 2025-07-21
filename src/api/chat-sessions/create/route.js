async function handler({ title }) {
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return { error: "Title is required and must be a non-empty string" };
  }

  try {
    const result = await sql`
      INSERT INTO chat_sessions (title, created_at, updated_at)
      VALUES (${title.trim()}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, title, created_at, updated_at
    `;

    if (result.length === 0) {
      return { error: "Failed to create chat session" };
    }

    return {
      success: true,
      session: result[0],
    };
  } catch (error) {
    console.error("Error creating chat session:", error);
    return { error: "Database error occurred while creating chat session" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}

async function handler({ sessionId }) {
  if (!sessionId || typeof sessionId !== "number") {
    return { error: "Session ID is required and must be a number" };
  }

  try {
    const messages = await sql`
      SELECT id, session_id, role, content, image_url, image_prompt, image_specs, created_at
      FROM chat_messages
      WHERE session_id = ${sessionId}
      ORDER BY created_at ASC
    `;

    return {
      success: true,
      messages: messages,
    };
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    return { error: "Database error occurred while fetching chat messages" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}

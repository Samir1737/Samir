async function handler({
  sessionId,
  role,
  content,
  imageUrl,
  imagePrompt,
  imageSpecs,
}) {
  if (!sessionId || typeof sessionId !== "number") {
    return { error: "Session ID is required and must be a number" };
  }

  if (!role || !["user", "assistant", "system"].includes(role)) {
    return {
      error: "Role is required and must be 'user', 'assistant', or 'system'",
    };
  }

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return { error: "Content is required and must be a non-empty string" };
  }

  try {
    const result = await sql`
      INSERT INTO chat_messages (session_id, role, content, image_url, image_prompt, image_specs, created_at)
      VALUES (${sessionId}, ${role}, ${content.trim()}, ${imageUrl || null}, ${
      imagePrompt || null
    }, ${imageSpecs ? JSON.stringify(imageSpecs) : null}, CURRENT_TIMESTAMP)
      RETURNING id, session_id, role, content, image_url, image_prompt, image_specs, created_at
    `;

    if (result.length === 0) {
      return { error: "Failed to save chat message" };
    }

    await sql`
      UPDATE chat_sessions 
      SET updated_at = CURRENT_TIMESTAMP 
      WHERE id = ${sessionId}
    `;

    return {
      success: true,
      message: result[0],
    };
  } catch (error) {
    console.error("Error saving chat message:", error);
    return { error: "Database error occurred while saving chat message" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}

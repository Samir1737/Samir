async function handler({ sessionId }) {
  if (!sessionId || typeof sessionId !== "number") {
    return { error: "Session ID is required and must be a number" };
  }

  try {
    const deleteResult = await sql`
      DELETE FROM chat_sessions 
      WHERE id = ${sessionId}
      RETURNING id, title
    `;

    if (deleteResult.length === 0) {
      return { error: "Chat session not found" };
    }

    return {
      success: true,
      deletedSession: deleteResult[0],
    };
  } catch (error) {
    console.error("Error deleting chat session:", error);
    return { error: "Database error occurred while deleting chat session" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}

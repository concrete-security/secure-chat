export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sanitizedMessages = ensureSystemMessage(sanitizeMessages(body?.messages));

    const model = (body?.model && String(body.model)) || DEFAULT_MODEL;
    const temperature = typeof body?.temperature === "number" ? body.temperature : DEFAULT_TEMPERATURE;
    const max_tokens = typeof body?.max_tokens === "number" ? body.max_tokens : DEFAULT_MAX_TOKENS;
    const stream = Boolean(body?.stream);

    const resp = await client.chat.completions.create({
      model,
      messages: sanitizedMessages,
      temperature,
      max_tokens,
      stream,
      extra_body: { reasoning_effort: "high" },
    });

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of resp) {
              const token = chunk.choices[0]?.delta?.content || "";
              if (token) {
                // Format SSE : "data: ...\n\n"
                controller.enqueue(encoder.encode(`data: ${token}\n\n`));
              }
            }
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          } catch (err) {
            controller.error(err);
          } finally {
            controller.close();
          }
        },
      });

      return new NextResponse(readable, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "Transfer-Encoding": "chunked",
        },
      });
    }

    // Non-streaming (fallback)
    const first = resp.choices?.[0];
    const message =
      first?.message?.content ??
      getProviderResponseText(resp as ProviderResponse) ??
      JSON.stringify(resp);

    return NextResponse.json({ message, raw: resp });

  } catch (error: any) {
    console.error("Confidential chat failed", error);
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

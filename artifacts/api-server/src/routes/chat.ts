import { GoogleGenAI } from "@google/genai";
import { StreamChatCompletionBody } from "@workspace/api-zod";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/chat/completions", async (req, res): Promise<void> => {
  const parsed = StreamChatCompletionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please provide a valid chat conversation." });
    return;
  }

  const apiKey = process.env.Gemini_API_Key_2;
  if (!apiKey) {
    res.status(503).json({
      error: "The AI service is not configured. Add a Gemini API key to project secrets.",
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const stream = await ai.models.generateContentStream({
      model: "gemini-3.8-flash",
      contents: parsed.data.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      config: { maxOutputTokens: 8192 },
    });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    for await (const chunk of stream) {
      if (res.destroyed || res.writableEnded) return;
      const content = chunk.text;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    if (!res.destroyed && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  } catch (error) {
    const providerStatus =
      error !== null &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : undefined;
    const providerMessage =
      error instanceof Error
        ? error.message.replaceAll(apiKey, "[redacted]").slice(0, 500)
        : undefined;
    req.log.error(
      {
        errorName: error instanceof Error ? error.name : "UnknownError",
        providerStatus,
        providerMessage,
      },
      "Gemini chat generation failed",
    );

    if (res.headersSent) {
      if (!res.destroyed && !res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({ error: "The assistant couldn't finish responding. Please try again." })}\n\n`,
        );
        res.end();
      }
      return;
    }

    const isProviderBusy = providerStatus === 503;
    res.status(isProviderBusy ? 503 : 502).json({
      error: isProviderBusy
        ? "The AI service is temporarily busy. Please try again shortly."
        : "The assistant couldn't respond right now. Please try again.",
    });
  }
});

export default router;

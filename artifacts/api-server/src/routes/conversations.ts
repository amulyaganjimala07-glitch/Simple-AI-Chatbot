import {
  CreateChatConversationBody,
  DeleteChatConversationParams,
  GetChatConversationParams,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import {
  CHAT_STORAGE_ERROR,
  getBrowserOwnerId,
  getSupabaseAdmin,
  reportSupabaseError,
} from "../lib/supabase";

const router: IRouter = Router();

router.get("/chat/conversations", async (req, res): Promise<void> => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    res.status(503).json({ error: CHAT_STORAGE_ERROR });
    return;
  }

  const ownerId = getBrowserOwnerId(req, res);
  const { data, error } = await supabase
    .from("morrow_conversations")
    .select("id,title,created_at,updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    reportSupabaseError(req, "list conversations", error);
    res.status(503).json({ error: CHAT_STORAGE_ERROR });
    return;
  }

  res.json(
    (data ?? []).map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
    })),
  );
});

router.post("/chat/conversations", async (req, res): Promise<void> => {
  const parsed = CreateChatConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please provide a valid conversation title." });
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    res.status(503).json({ error: CHAT_STORAGE_ERROR });
    return;
  }

  const ownerId = getBrowserOwnerId(req, res);
  const { data, error } = await supabase
    .from("morrow_conversations")
    .insert({ owner_id: ownerId, title: parsed.data.title })
    .select("id,title,created_at,updated_at")
    .single();

  if (error) {
    reportSupabaseError(req, "create conversation", error);
    res.status(503).json({ error: CHAT_STORAGE_ERROR });
    return;
  }

  res.status(201).json({
    id: data.id,
    title: data.title,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });
});

router.get(
  "/chat/conversations/:conversationId",
  async (req, res): Promise<void> => {
    const parsedParams = GetChatConversationParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "Please provide a valid conversation ID." });
      return;
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      res.status(503).json({ error: CHAT_STORAGE_ERROR });
      return;
    }

    const ownerId = getBrowserOwnerId(req, res);
    const { data: conversation, error: conversationError } = await supabase
      .from("morrow_conversations")
      .select("id,title,created_at,updated_at")
      .eq("id", parsedParams.data.conversationId)
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (conversationError) {
      reportSupabaseError(req, "load conversation", conversationError);
      res.status(503).json({ error: CHAT_STORAGE_ERROR });
      return;
    }
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }

    const { data: messages, error: messagesError } = await supabase
      .from("morrow_messages")
      .select("id,role,content,created_at")
      .eq("conversation_id", conversation.id)
      .order("sequence", { ascending: true });

    if (messagesError) {
      reportSupabaseError(req, "load conversation messages", messagesError);
      res.status(503).json({ error: CHAT_STORAGE_ERROR });
      return;
    }

    res.json({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      messages: (messages ?? []).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.created_at,
      })),
    });
  },
);

router.delete(
  "/chat/conversations/:conversationId",
  async (req, res): Promise<void> => {
    const parsedParams = DeleteChatConversationParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "Please provide a valid conversation ID." });
      return;
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      res.status(503).json({ error: CHAT_STORAGE_ERROR });
      return;
    }

    const ownerId = getBrowserOwnerId(req, res);
    const { data, error } = await supabase
      .from("morrow_conversations")
      .delete()
      .eq("id", parsedParams.data.conversationId)
      .eq("owner_id", ownerId)
      .select("id")
      .maybeSingle();

    if (error) {
      reportSupabaseError(req, "delete conversation", error);
      res.status(503).json({ error: CHAT_STORAGE_ERROR });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }

    res.sendStatus(204);
  },
);

export default router;

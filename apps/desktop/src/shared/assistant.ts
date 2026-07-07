export type AssistantProviderId = "codex" | "claude-code" | "opencode";

export type AssistantProviderStatus =
  | {
      state: "not_installed";
      installUrl: string;
    }
  | {
      state: "installed_not_authenticated";
      connectLabel: string;
      setupUrl: string;
    }
  | {
      state: "installed_not_configured";
      configureUrl?: string;
    }
  | {
      state: "ready";
      accountLabel?: string;
    }
  | {
      state: "error";
      message: string;
    };

export type AssistantProvider = {
  id: AssistantProviderId;
  name: string;
  description: string;
  installUrl: string;
  status: AssistantProviderStatus;
};

export type AssistantChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export type AssistantConversation = {
  id: string;
  providerId: AssistantProviderId;
  messages: AssistantChatMessage[];
  busy: boolean;
};

export type AssistantSendMessageInput = {
  conversationId?: string;
  providerId: AssistantProviderId;
  message: string;
};

export type AssistantSendMessageResult = {
  conversation: AssistantConversation;
  requestId: string;
};

export type AssistantStreamEvent =
  | {
      type: "started";
      conversationId: string;
      requestId: string;
      assistantMessageId: string;
    }
  | {
      type: "delta";
      conversationId: string;
      requestId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: "status";
      conversationId: string;
      requestId: string;
      message: string;
    }
  | {
      type: "done";
      conversationId: string;
      requestId: string;
      messageId: string;
      content: string;
    }
  | {
      type: "error";
      conversationId: string;
      requestId: string;
      message: string;
    };

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatChannel {
  id: string;
  name: string;
}

export const CHAT_STORE_KEY = "extraction-ops-chat";

interface ChatState {
  channels: ChatChannel[];
  addChannel: (name: string) => ChatChannel;
  renameChannel: (channelId: string, name: string) => void;
  removeChannel: (channelId: string) => void;
}

export const GENERAL_CHANNEL_ID = "channel-general";

const DEFAULT_CHANNELS: ChatChannel[] = [
  { id: GENERAL_CHANNEL_ID, name: "일반" },
  { id: "channel-client-dev", name: "클라이언트-개발" },
  { id: "channel-art-assets", name: "아트-에셋" },
  { id: "channel-qa-report", name: "qa-리포트" },
];

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      channels: DEFAULT_CHANNELS,

      addChannel: (name) => {
        const channel: ChatChannel = { id: crypto.randomUUID(), name };
        set((state) => ({ channels: [...state.channels, channel] }));
        return channel;
      },

      renameChannel: (channelId, name) => {
        set((state) => ({
          channels: state.channels.map((channel) =>
            channel.id === channelId ? { ...channel, name } : channel
          ),
        }));
      },

      removeChannel: (channelId) => {
        set((state) => ({
          channels: state.channels.filter((channel) => channel.id !== channelId),
        }));
      },
    }),
    { name: CHAT_STORE_KEY }
  )
);

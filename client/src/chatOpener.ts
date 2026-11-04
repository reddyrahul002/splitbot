// Lets an empty state's "Add an expense" reach the chat from anywhere. Without a provider it does nothing.
import { createContext, useContext } from 'react';

export const ChatOpenerContext = createContext<() => void>(() => {});

export const useOpenChat = () => useContext(ChatOpenerContext);

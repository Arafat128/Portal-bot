import React, { useState, useEffect, useRef } from 'react';
import { Send, LogOut, User } from 'lucide-react';

interface Message {
  id: number;
  content: string;
  sender: 'user' | 'admin';
  created_at: string;
}

interface ChatProps {
  token: string;
  username: string;
  onLogout: () => void;
}

export function Chat({ token, username, onLogout }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    try {
      const response = await fetch('/api/messages', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      } else if (response.status === 401 || response.status === 403) {
        onLogout();
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  useEffect(() => {
    fetchMessages();
    // Poll for new messages every 3 seconds
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: newMessage })
      });

      if (response.ok) {
        const message = await response.json();
        setMessages(prev => [...prev, message]);
        setNewMessage('');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-transparent">
      {/* Header */}
      <header className="glass-panel mx-4 mt-4 rounded-2xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white/40 p-2 rounded-full shadow-sm">
            <User className="w-5 h-5 text-indigo-800" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 drop-shadow-sm" style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '0.9rem' }}>Portal Chat</h1>
            <p className="text-sm text-gray-800 font-medium">Logged in as {username}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center text-gray-700 hover:text-gray-900 transition-colors font-medium bg-white/30 px-3 py-1.5 rounded-lg hover:bg-white/50"
        >
          <LogOut className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-700">
            <div className="glass-panel p-6 rounded-2xl text-center">
              <p className="text-lg font-bold mb-1">No messages yet.</p>
              <p className="text-sm">Send a message to start chatting!</p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-5 py-3 shadow-sm backdrop-blur-md border border-white/40 ${
                    isUser
                      ? 'bg-blue-500/80 text-white rounded-br-none'
                      : 'bg-white/70 text-gray-900 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap font-medium">{msg.content}</p>
                  <span
                    className={`text-xs mt-2 block ${
                      isUser ? 'text-blue-100' : 'text-gray-600'
                    }`}
                  >
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 mb-4 mx-4">
        <form
          onSubmit={handleSendMessage}
          className="max-w-4xl mx-auto flex items-end gap-2 glass-panel p-2 rounded-2xl"
        >
          <div className="flex-1 bg-white/40 rounded-xl border border-white/50 focus-within:border-white/80 focus-within:bg-white/60 transition-all">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="w-full bg-transparent border-none focus:ring-0 resize-none p-3 max-h-32 min-h-[44px] text-gray-900 placeholder-gray-600 font-medium outline-none"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim() || loading}
            className="glass-button-primary p-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

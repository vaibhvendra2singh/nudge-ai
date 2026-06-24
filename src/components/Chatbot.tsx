import React, { useState, useRef, useEffect } from "react";

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: "user"|"model", content: string}[]>([
    { role: "model", content: "Hi! I'm your AI assistant. How can I help you today?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, { role: "user", content: userMessage }] })
      });
      const data = await response.json();
      if (data.reply) {
        setMessages(prev => [...prev, { role: "model", content: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: "model", content: "I encountered an error. Please try again." }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: "model", content: "Sorry, I'm having trouble connecting right now." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Chatbot Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle AI Chat"
        className="fixed bottom-44 right-6 w-14 h-14 bg-white text-black rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-zinc-200 hover:bg-zinc-50 transition-all duration-150 hover:scale-105 active:scale-95 z-40 cursor-pointer"
      >
        <span className="material-symbols-outlined text-[26px]">smart_toy</span>
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-[240px] right-6 w-[320px] sm:w-[350px] bg-white border border-zinc-200 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col h-[400px] max-h-[60vh] animate-fade-in">
          <div className="bg-black text-white p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">smart_toy</span>
              <span className="font-bold font-headline uppercase text-sm tracking-wider">AI Assistant</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white transition-colors cursor-pointer">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#FAFAFA]">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${msg.role === "user" ? "bg-black text-white rounded-br-sm" : "bg-white border border-zinc-200 text-black rounded-bl-sm"}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-zinc-200 text-zinc-500 rounded-2xl rounded-bl-sm p-3 text-sm flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }}></div>
                  <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} className="p-3 bg-white border-t border-zinc-100 flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything..."
              className="flex-1 bg-zinc-100 border-none rounded-xl px-4 py-2 text-base sm:text-sm focus:outline-none focus:ring-1 focus:ring-black transition-all"
            />
            <button 
              type="submit" 
              disabled={isLoading || !input.trim()}
              className="bg-black text-white w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-50 transition-opacity cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
            </button>
          </form>
        </div>
      )}
    </>
  );
}

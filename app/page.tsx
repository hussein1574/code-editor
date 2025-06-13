"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Download, Plus, Minus, Users } from "lucide-react";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================
interface Cursor {
  id: string;
  position: number;
  color: string;
  user: string;
}

interface User {
  id: string;
  name: string;
  color: string;
  activeRegion?: { start: number; end: number };
  lastActivity?: number;
}

interface Message {
  type: "cursor" | "code" | "selection";
  content?: string;
  position?: number;
  selection?: { start: number; end: number };
  userId: string;
  color?: string;
  timestamp: number;
}

interface Token {
  type: string;
  value: string;
  start: number;
  end: number;
}

interface MockWebSocket {
  send: (data: string) => void;
  close: () => void;
  onmessage: ((event: Event) => void) | null;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const CodeEditorUI = () => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  const [fontSize, setFontSize] = useState(14);
  const [code, setCode] = useState(`<h1>Hello World</h1>`);
  const [highlightedCode, setHighlightedCode] = useState("");
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [userId] = useState("You");
  const [lastUserEdit, setLastUserEdit] = useState<{
    timestamp: number;
    userId: string;
    position: number;
  }>({ timestamp: 0, userId: "", position: 0 });
  const [isTyping, setIsTyping] = useState(false);
  // ============================================================================
  // REFS
  // ============================================================================
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<MockWebSocket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ============================================================================
  // CONSTANTS
  // ============================================================================
  const userColors = [
    "#ff6b35",
    "#4ecdc4",
    "#45b7d1",
    "#96ceb4",
    "#feca57",
    "#ff9ff3",
    "#54a0ff",
  ];

  const [userColor] = useState(
    () => userColors[Math.floor(Math.random() * userColors.length)]
  );
  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  const markUserAsTyping = useCallback(() => {
    setIsTyping(true);
    setLastUserEdit({
      timestamp: Date.now(),
      userId,
      position: textareaRef.current?.selectionStart || 0,
    });

    // Clear any existing typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    } // Set a new timeout to clear typing state after user stops typing
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 800); // Clear typing state 800ms after user stops typing
  }, [userId]);

  const syncScroll = () => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const increaseFontSize = () => setFontSize((prev) => Math.min(prev + 2, 24));
  const decreaseFontSize = () => setFontSize((prev) => Math.max(prev - 2, 10));

  const handleExport = () => {
    const element = document.createElement("a");
    const file = new Blob([code], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = "code.html";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // ============================================================================
  // SYNTAX HIGHLIGHTING CONFIGURATION
  // ============================================================================
  // JavaScript Keywords for syntax highlighting
  const jsKeywords = new Set([
    "const",
    "let",
    "var",
    "function",
    "return",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "break",
    "continue",
    "class",
    "extends",
    "import",
    "export",
    "default",
    "async",
    "await",
    "try",
    "catch",
    "finally",
    "throw",
    "new",
    "this",
    "super",
    "null",
    "undefined",
    "true",
    "false",
    "typeof",
    "instanceof",
    "delete",
    "void",
    "yield",
    "static",
    "private",
    "public",
  ]);

  const cssProperties = [
    "color",
    "background",
    "background-color",
    "font-size",
    "margin",
    "padding",
    "border",
    "width",
    "height",
    "display",
    "position",
    "top",
    "left",
    "right",
    "bottom",
    "flex",
    "grid",
    "align-items",
    "justify-content",
    "text-align",
    "font-weight",
    "font-family",
    "line-height",
    "box-shadow",
    "border-radius",
    "transition",
    "transform",
    "animation",
    "opacity",
    "z-index",
    "overflow",
    "cursor",
    "float",
    "clear",
    "visibility",
    "content",
    "list-style",
    "text-decoration",
    "vertical-align",
    "white-space",
    "word-wrap",
  ];

  const tokenizeJavaScript = useCallback(
    (code: string): Token[] => {
      const tokens: Token[] = [];
      const patterns = [
        // Comments
        { regex: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g, type: "comment" },
        // Strings
        { regex: /(["'`])(?:(?=(\\?))\2[\s\S])*?\1/g, type: "string" },
        // Numbers
        { regex: /\b\d+(?:\.\d+)?\b/g, type: "number" },
        // Keywords and identifiers
        { regex: /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g, type: "identifier" },
        // Operators and punctuation
        { regex: /[+\-*/%=<>!&|^~?:;,.(){}[\]]/g, type: "punctuation" },
        // Whitespace
        { regex: /\s+/g, type: "whitespace" },
      ];

      const usedRanges = new Set<string>();

      // First pass: collect all matches
      patterns.forEach(({ regex, type }) => {
        let match;
        regex.lastIndex = 0;
        while ((match = regex.exec(code)) !== null) {
          const range = `${match.index}-${match.index + match[0].length}`;
          if (!usedRanges.has(range)) {
            tokens.push({
              type,
              value: match[0],
              start: match.index,
              end: match.index + match[0].length,
            });
            usedRanges.add(range);
          }
        }
      });

      // Sort by position
      tokens.sort((a, b) => a.start - b.start);

      // Post-process identifiers to mark keywords and functions
      return tokens.map((token, index) => {
        if (token.type === "identifier") {
          if (jsKeywords.has(token.value)) {
            return { ...token, type: "keyword" };
          }
          // Check if followed by '('
          const nextToken = tokens[index + 1];
          if (
            nextToken &&
            nextToken.value === "(" &&
            (index === 0 ||
              tokens[index - 1].type === "whitespace" ||
              tokens[index - 1].value === "=" ||
              tokens[index - 1].value === ":")
          ) {
            return { ...token, type: "function" };
          }
        }
        return token;
      });
    },
    [jsKeywords]
  ); // ============================================================================
  // SYNTAX HIGHLIGHTING FUNCTIONS
  // ============================================================================
  const escapeHtml = useCallback((text: string): string => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }, []);

  const highlightJavaScriptTokens = useCallback(
    (tokens: Token[]): string => {
      return tokens
        .map((token) => {
          const escaped = escapeHtml(token.value);
          switch (token.type) {
            case "keyword":
              return `<span class="text-purple-600">${escaped}</span>`;
            case "string":
              return `<span class="text-green-600">${escaped}</span>`;
            case "number":
              return `<span class="text-orange-600">${escaped}</span>`;
            case "function":
              return `<span class="text-yellow-600">${escaped}</span>`;
            case "comment":
              return `<span class="text-gray-500">${escaped}</span>`;
            default:
              return escaped;
          }
        })
        .join("");
    },
    [escapeHtml]
  );

  const highlightSyntax = useCallback(
    (text: string) => {
      // Escape HTML to prevent XSS
      let highlighted = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      // Store script and style content to process separately
      const scriptBlocks: { placeholder: string; content: string }[] = [];
      const styleBlocks: { placeholder: string; content: string }[] = [];

      // Extract and process <script> blocks
      highlighted = highlighted.replace(
        /(&lt;script[^&]*?&gt;)([\s\S]*?)(&lt;\/script&gt;)/gi,
        (match, openTag, content, closeTag) => {
          const placeholder = `__SCRIPT_${scriptBlocks.length}__`;
          scriptBlocks.push({ placeholder, content });
          return `${openTag}${placeholder}${closeTag}`;
        }
      );

      // Extract and process <style> blocks
      highlighted = highlighted.replace(
        /(&lt;style[^&]*?&gt;)([\s\S]*?)(&lt;\/style&gt;)/gi,
        (match, openTag, content, closeTag) => {
          const placeholder = `__STYLE_${styleBlocks.length}__`;
          styleBlocks.push({ placeholder, content });
          return `${openTag}${placeholder}${closeTag}`;
        }
      );

      // HTML comments
      highlighted = highlighted.replace(
        /(&lt;!--[\s\S]*?--&gt;)/g,
        '<span class="text-gray-500">$1</span>'
      );

      // HTML tags (including special handling for script and style tags)
      highlighted = highlighted.replace(
        /(&lt;\/?)(\w+)((?:\s+\w+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^'"&gt;\s]+))?)*\s*\/?)(&gt;)/g,
        (match, p1, tagName, p3, p4) => {
          // Highlight attributes
          const attrs = p3.replace(
            /(\w+)(\s*=\s*)(["']?)([^"']*)\3/g,
            '<span class="text-yellow-600">$1</span>$2<span class="text-green-600">$3$4$3</span>'
          );

          // Special coloring for script and style tags
          const tagClass =
            tagName === "script" || tagName === "style"
              ? "text-purple-600 font-semibold"
              : "text-blue-600";

          return `<span class="${tagClass}">${p1}${tagName}</span>${attrs}<span class="${tagClass}">${p4}</span>`;
        }
      );

      // Process JavaScript in script blocks using the new tokenizer
      scriptBlocks.forEach(({ placeholder, content }) => {
        // Use the new JavaScript tokenizer
        const tokens = tokenizeJavaScript(content);
        const jsHighlighted = highlightJavaScriptTokens(tokens);

        highlighted = highlighted.replace(placeholder, jsHighlighted);
      });

      // Process CSS in style blocks
      styleBlocks.forEach(({ placeholder, content }) => {
        let cssHighlighted = content;

        // CSS comments
        cssHighlighted = cssHighlighted.replace(
          /(\/\*[\s\S]*?\*\/)/g,
          '<span class="text-gray-500">$1</span>'
        );

        // CSS rules
        cssHighlighted = cssHighlighted.replace(
          /((?:^|\})\s*)([^{]+)\s*\{([^}]*)\}/gm,
          (match, prefix, selector, rules) => {
            // Highlight selectors
            const highlightedSelector = selector.replace(
              /([.#]?[\w-:]+)/g,
              '<span class="text-blue-600">$1</span>'
            );

            // Highlight properties and values in rules
            let highlightedRules = rules;

            // Highlight properties
            cssProperties.forEach((prop) => {
              const regex = new RegExp(`\\b(${prop})\\s*:`, "g");
              highlightedRules = highlightedRules.replace(
                regex,
                '<span class="text-purple-600">$1</span>:'
              );
            });

            // Highlight values
            highlightedRules = highlightedRules.replace(
              /:\s*([^;]+)/g,
              ': <span class="text-green-600">$1</span>'
            );

            return `${prefix}${highlightedSelector} {${highlightedRules}}`;
          }
        );

        highlighted = highlighted.replace(placeholder, cssHighlighted);
      });

      // Inline style attributes
      highlighted = highlighted.replace(
        /style=<span class="text-green-600">"([^"]*)"<\/span>/g,
        (match, styleContent) => {
          let highlightedStyle = styleContent;

          // Highlight CSS properties in inline styles
          cssProperties.forEach((prop) => {
            const regex = new RegExp(`\\b(${prop})\\s*:`, "g");
            highlightedStyle = highlightedStyle.replace(
              regex,
              '<span class="text-purple-600">$1</span>:'
            );
          });

          // Highlight values
          highlightedStyle = highlightedStyle.replace(
            /:\s*([^;]+)/g,
            ': <span class="text-cyan-600">$1</span>'
          );

          return `style=<span class="text-green-600">"${highlightedStyle}"</span>`;
        }
      );
      return highlighted;
    },
    [highlightJavaScriptTokens, cssProperties, tokenizeJavaScript]
  );
  useEffect(() => {
    setHighlightedCode(highlightSyntax(code));
  }, [code, highlightSyntax]);
  // ============================================================================
  // WEBSOCKET CONNECTION MANAGEMENT
  // ============================================================================
  // WebSocket connection
  useEffect(() => {
    let simulationInterval: NodeJS.Timeout;

    const connectWebSocket = () => {
      try {
        // Mock WebSocket for demo - in production, replace with your WebSocket server
        const mockWs: MockWebSocket = {
          send: (data: string) => {
            const message = JSON.parse(data) as Message;
            // Simulate other users with better conflict prevention
            if (message.type === "cursor" || message.type === "code") {
              setTimeout(() => {
                const mockUser: User = {
                  id: "mock-user-1",
                  name: "Demo User",
                  color: "#4ecdc4",
                };
                if (message.type === "cursor") {
                  setCursors((prev) => {
                    const filtered = prev.filter((c) => c.id !== mockUser.id);
                    // Position demo cursor at a safe distance - use fixed range to avoid dependency
                    const safePosition = Math.min(
                      50,
                      Math.max(10, Math.floor(Math.random() * 30))
                    );

                    return [
                      ...filtered,
                      {
                        id: mockUser.id,
                        position: safePosition,
                        color: mockUser.color,
                        user: mockUser.name,
                      },
                    ];
                  });
                }
              }, 500);
            }
          },
          close: () => {},
          onmessage: (event: Event) => {
            // Handle incoming messages from other users
            const messageEvent = event as MessageEvent;
            try {
              const message = JSON.parse(messageEvent.data) as Message; // Handle incoming code changes from other users with conflict prevention
              if (
                message.type === "code" &&
                message.userId !== userId &&
                message.content
              ) {
                // Check if user has been actively editing recently (extended protection)
                const now = Date.now();
                const timeSinceLastEdit = now - lastUserEdit.timestamp;

                // Only apply changes if user hasn't been actively editing for a longer period
                // and is definitely not typing
                if (timeSinceLastEdit > 10000 && !isTyping) {
                  setCode(message.content);
                  console.log(`Code updated by ${message.userId}`);
                } else {
                  console.log(
                    `Blocked code update from ${message.userId} - user is actively editing (last activity: ${timeSinceLastEdit}ms ago, typing: ${isTyping})`
                  );
                }
              }

              // Handle incoming cursor updates from other users
              if (message.type === "cursor" && message.userId !== userId) {
                setCursors((prev) => {
                  const filtered = prev.filter((c) => c.id !== message.userId);

                  // Use the color from the message or a default color
                  if (typeof message.position === "number") {
                    return [
                      ...filtered,
                      {
                        id: message.userId,
                        position: message.position,
                        color: message.color || "#4ecdc4", // Default color
                        user:
                          message.userId === "mock-user-1"
                            ? "Demo User"
                            : message.userId,
                      },
                    ];
                  }
                  return filtered;
                });
              }
            } catch (error) {
              console.error("Error parsing incoming message:", error);
            }
          },
          onopen: null,
          onclose: null,
          onerror: null,
        };

        wsRef.current = mockWs;
        setIsConnected(true);

        setUsers([
          { id: userId, name: "You", color: userColor },
          { id: "mock-user-1", name: "Demo User", color: "#4ecdc4" },
        ]); // Improved simulation - cursor movement and occasional code changes when user is inactive
        const simulateIncomingMessages = () => {
          simulationInterval = setInterval(() => {
            // Get current state values (not captured in closure)
            const currentTime = Date.now();

            // Always simulate cursor movements
            if (Math.random() > 0.6) {
              // 40% chance every 3 seconds for cursor movement
              const mockMessage = {
                type: "cursor" as const,
                position: Math.floor(Math.random() * Math.max(50, code.length)), // Random cursor position
                userId: "mock-user-1",
                color: "#4ecdc4",
                timestamp: currentTime,
              };

              if (mockWs.onmessage) {
                const mockEvent = {
                  data: JSON.stringify(mockMessage),
                } as MessageEvent;
                mockWs.onmessage(mockEvent);
              }
            }

            // For code changes, we need to check current state - this will be handled by a separate mechanism
            // to avoid closure issues with stale state values
          }, 3000); // Check every 3 seconds for more responsive simulation
        };

        // Start simulating incoming messages after a delay
        setTimeout(simulateIncomingMessages, 5000);
      } catch (error) {
        console.error("WebSocket connection failed:", error);
        setIsConnected(false);
      }
    };

    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      // Clear the simulation interval to prevent memory leaks
      if (simulationInterval) {
        clearInterval(simulationInterval);
      }
      // Clear the typing timeout to prevent memory leaks
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [userId, userColor, lastUserEdit.timestamp, isTyping, code]); // Dependencies for WebSocket

  // ============================================================================
  // MOCK USER CODE CHANGES (separate effect to access current state)
  // ============================================================================
  useEffect(() => {
    let mockCodeInterval: NodeJS.Timeout;

    if (isConnected) {
      mockCodeInterval = setInterval(() => {
        const currentTime = Date.now();
        const timeSinceLastEdit = currentTime - lastUserEdit.timestamp;

        // Only make code changes if user has been inactive for more than 10 seconds and not currently typing
        if (timeSinceLastEdit > 10000 && !isTyping && Math.random() > 0.85) {
          // 15% chance when inactive
          console.log(
            `Mock user attempting code change - inactive for: ${timeSinceLastEdit}ms, typing: ${isTyping}`
          );

          const mockCodeChanges = [
            code + "\n<!-- Added by Demo User -->",
            code.replace("<h1>", '<h1 style="color: blue;">'),
            code + "\n<p>Demo user was here!</p>",
            code.replace("Hello World", "Hello Collaborative World"),
          ];

          const randomChange =
            mockCodeChanges[Math.floor(Math.random() * mockCodeChanges.length)];

          const mockMessage = {
            type: "code" as const,
            content: randomChange,
            userId: "mock-user-1",
            timestamp: currentTime,
          };

          // Directly trigger the mock WebSocket message handler
          if (wsRef.current?.onmessage) {
            const mockEvent = {
              data: JSON.stringify(mockMessage),
            } as MessageEvent;
            wsRef.current.onmessage(mockEvent);
          }
        } else if (isTyping || timeSinceLastEdit <= 10000) {
          console.log(
            `Mock user code change blocked - typing: ${isTyping}, time since edit: ${timeSinceLastEdit}ms`
          );
        }
      }, 5000); // Check every 5 seconds for code changes
    }

    return () => {
      if (mockCodeInterval) {
        clearInterval(mockCodeInterval);
      }
    };
  }, [isConnected, lastUserEdit.timestamp, isTyping, code]); // Dependencies for mock user code changes

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================
  const sendMessage = useCallback(
    (message: Message) => {
      if (wsRef.current && isConnected) {
        wsRef.current.send(JSON.stringify(message));
      }
    },
    [isConnected]
  );
  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    markUserAsTyping(); // Use the debounced typing handler

    sendMessage({
      type: "code",
      content: newCode,
      userId,
      timestamp: Date.now(),
    });
  };
  const handleCursorChange = (position: number) => {
    setLastUserEdit({ timestamp: Date.now(), userId, position });
    sendMessage({
      type: "cursor",
      position,
      userId,
      color: userColor,
      timestamp: Date.now(),
    });
  };

  // ============================================================================
  // CURSOR POSITION CALCULATION AND RENDERING
  // ============================================================================  // Calculate cursor position based on code content with text wrapping support
  const calculateCursorPosition = (position: number) => {
    if (!textareaRef.current) {
      return { line: 0, column: 0, x: 16, y: 16 };
    }

    const textarea = textareaRef.current;
    const textBeforeCursor = code.substring(0, position);

    // Get textarea styling to calculate proper wrapping
    const style = window.getComputedStyle(textarea);
    const paddingLeft = parseInt(style.paddingLeft) || 16;
    const paddingTop = parseInt(style.paddingTop) || 16; // Calculate character width based on font size
    const charWidth = fontSize * 0.6; // Monospace font character width ratio
    const lineHeight = fontSize * 1.6; // Updated to match the new line-height of 1.6

    // Get the actual width available for text (minus padding)
    const textAreaWidth = textarea.clientWidth - paddingLeft * 2;
    const maxCharsPerLine = Math.floor(textAreaWidth / charWidth);

    // Split text by actual line breaks first
    const lines = textBeforeCursor.split("\n");
    let totalVisualLines = 0;
    let finalColumn = 0;

    // Process each line to account for wrapping
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];

      if (i === lines.length - 1) {
        // This is the line containing our cursor
        const wrappedLines = Math.floor(lineText.length / maxCharsPerLine);
        totalVisualLines += wrappedLines;
        finalColumn = lineText.length % maxCharsPerLine;
      } else {
        // Full line - calculate how many visual lines it takes
        const wrappedLines = Math.max(
          1,
          Math.ceil(lineText.length / maxCharsPerLine)
        );
        totalVisualLines += wrappedLines;
      }
    }

    return {
      line: totalVisualLines,
      column: finalColumn,
      x: finalColumn * charWidth + paddingLeft,
      y: totalVisualLines * lineHeight + paddingTop,
    };
  }; // Render cursor positions
  const renderCursors = () => {
    return cursors.map((cursor) => {
      const { x, y } = calculateCursorPosition(cursor.position);
      return (
        <div
          key={cursor.id}
          className="absolute pointer-events-none z-20 transition-all duration-300 ease-out"
          style={{
            left: `${x}px`,
            top: `${y}px`,
          }}
        >
          <div
            className="w-0.5 h-6 animate-pulse shadow-lg"
            style={{
              backgroundColor: cursor.color,
              boxShadow: `0 0 10px ${cursor.color}40`,
            }}
          />
          <div
            className="text-xs text-white px-2 py-1 rounded-md mt-1 whitespace-nowrap shadow-lg backdrop-blur-sm border border-white/20 transition-all duration-300 transform hover:scale-105"
            style={{
              backgroundColor: cursor.color,
              boxShadow: `0 4px 12px ${cursor.color}30`,
            }}
          >
            <div className="flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-white/80 rounded-full"></div>
              <span className="font-medium">{cursor.user}</span>
            </div>
          </div>
          {/* Subtle glow effect */}
          <div
            className="absolute inset-0 w-0.5 h-6 animate-pulse opacity-50 blur-sm"
            style={{ backgroundColor: cursor.color }}
          />
        </div>
      );
    });
  }; // ============================================================================
  // RENDER COMPONENT
  // ============================================================================
  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* ============================================================================ */}
      {/* HEADER SECTION */}
      {/* ============================================================================ */}
      <header className="relative flex items-center justify-between px-4 lg:px-6 py-3 lg:py-4 bg-gradient-to-r from-gray-800/90 via-gray-700/90 to-gray-800/90 backdrop-blur-lg border-b border-gray-600/50 shadow-lg">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5"></div>

        <div className="relative flex items-center space-x-3">
          <div className="relative">
            <div className="w-8 h-8 lg:w-10 lg:h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg transform transition-transform hover:scale-105">
              <span className="text-white text-sm font-bold">CE</span>
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          </div>
          <div className="text-white hidden sm:block">
            <div className="font-semibold text-sm lg:text-base bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              {userId}
            </div>
            <div className="text-xs text-gray-400">@collaborative-dev</div>
          </div>
        </div>

        <div className="relative">
          <h1 className="text-white text-lg lg:text-2xl font-bold bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent">
            CodeSync Studio
          </h1>
          <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full"></div>
        </div>

        <div className="relative flex items-center space-x-2 lg:space-x-3">
          {/* Connection Status */}
          <div className="flex items-center space-x-2 bg-gray-700/50 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-600/50">
            <div className="relative">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-green-400" : "bg-red-400"
                } shadow-lg`}
              />
              {isConnected && (
                <div className="absolute inset-0 w-2 h-2 bg-green-400 rounded-full animate-ping"></div>
              )}
            </div>
            <span className="text-xs text-gray-300 hidden sm:inline font-medium">
              {users.length} user{users.length !== 1 ? "s" : ""} online
            </span>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            className="cursor-pointer group relative bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-4 lg:px-6 py-2.5 rounded-lg flex items-center space-x-2 text-sm lg:text-base transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <Download
              size={16}
              className="transition-transform group-hover:scale-110"
            />
            <span className="hidden sm:inline font-medium">Export</span>
            <div className="absolute inset-0 rounded-lg bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </button>

          {/* Font Controls */}
          <div className="flex items-center bg-gray-700/50 backdrop-blur-sm rounded-lg border border-gray-600/50 overflow-hidden">
            <button
              onClick={decreaseFontSize}
              className="cursor-pointer bg-transparent hover:bg-gray-600/50 text-white px-3 lg:px-4 py-2.5 flex items-center space-x-1 lg:space-x-2 transition-colors border-r border-gray-600/50"
            >
              <Minus size={14} />
              <span className="hidden lg:inline text-xs font-medium">A</span>
            </button>

            <div className="px-3 py-2.5 text-white text-sm font-mono bg-gray-800/50">
              {fontSize}px
            </div>

            <button
              onClick={increaseFontSize}
              className="cursor-pointer bg-transparent hover:bg-gray-600/50 text-white px-3 lg:px-4 py-2.5 flex items-center space-x-1 lg:space-x-2 transition-colors border-l border-gray-600/50"
            >
              <Plus size={14} />
              <span className="hidden lg:inline text-sm font-medium">A</span>
            </button>
          </div>
        </div>
      </header>{" "}
      {/* ============================================================================ */}
      {/* MAIN EDITOR CONTENT */}
      {/* ============================================================================ */}
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row relative">
        {/* Ambient background effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 pointer-events-none"></div>

        {/* Code Editor */}
        <div className="flex-1 flex flex-col relative z-10">
          <div className="flex-1 flex flex-col lg:flex-row">
            {/* Code Section*/}
            <div className="w-full lg:w-1/2 flex flex-col bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-sm h-1/2 lg:h-auto lg:min-h-0 border-r border-gray-600/30">
              {/* Editor Header */}
              <div className="bg-gradient-to-r from-gray-800/90 to-gray-700/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b border-gray-600/30 shadow-lg h-10">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-400 rounded-full shadow-lg"></div>
                    <div className="w-3 h-3 bg-yellow-400 rounded-full shadow-lg"></div>
                    <div className="w-3 h-3 bg-green-400 rounded-full shadow-lg"></div>
                  </div>
                  <span className="text-gray-300 text-sm font-medium bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    CODE EDITOR
                  </span>
                  {isTyping && (
                    <div className="flex items-center space-x-1">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                      <div
                        className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                      <span className="text-xs text-blue-400 ml-1">
                        typing...
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2 bg-gray-700/50 rounded-lg px-2 py-0.5 border border-gray-600/50">
                    <Users size={12} className="text-blue-400" />
                    <div className="flex -space-x-1">
                      {users.map((user) => (
                        <div
                          key={user.id}
                          className="relative w-5 h-5 rounded-full flex items-center justify-center text-white text-xs border-2 border-gray-700 shadow-lg transition-transform hover:scale-110 hover:z-10"
                          style={{ backgroundColor: user.color }}
                          title={user.name}
                        >
                          {user.name[0]}
                          {user.id === userId && (
                            <div className="absolute -top-1 -right-1 w-1 h-1 bg-blue-400 rounded-full"></div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>{" "}
              {/* Code Area */}
              <div className="flex-1 bg-gradient-to-br from-gray-900/95 to-gray-800/95 overflow-auto relative w-full border border-gray-600/20 shadow-inner">
                {renderCursors()}
                <div className="absolute inset-0 overflow-hidden bg-transparent">
                  <div
                    ref={highlightRef}
                    className="absolute inset-0 w-full h-full bg-transparent text-gray-300 p-4 font-mono leading-relaxed resize-none outline-none border-none whitespace-pre-wrap break-words overflow-wrap-anywhere"
                    dangerouslySetInnerHTML={{ __html: highlightedCode }}
                    style={{
                      fontSize: `${fontSize}px`,
                      overflowX: "hidden",
                      wordWrap: "break-word",
                      lineHeight: "1.6",
                    }}
                  />{" "}
                  <textarea
                    ref={textareaRef}
                    value={code}
                    onChange={(e) => {
                      handleCodeChange(e.target.value);
                    }}
                    onSelect={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      handleCursorChange(target.selectionStart);
                    }}
                    onClick={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      handleCursorChange(target.selectionStart);
                    }}
                    onKeyDown={() => {
                      // Mark user as actively typing on any keydown
                      markUserAsTyping();
                    }}
                    onKeyUp={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      handleCursorChange(target.selectionStart);
                    }}
                    onFocus={() => {
                      // Mark user as active when focusing on the editor
                      markUserAsTyping();
                    }}
                    onBlur={() => {
                      // Immediately clear typing state when user leaves the editor
                      setIsTyping(false);
                      if (typingTimeoutRef.current) {
                        clearTimeout(typingTimeoutRef.current);
                      }
                    }}
                    onScroll={syncScroll}
                    className="text-transparent absolute inset-0 w-full h-full bg-transparent caret-blue-400 p-4 font-mono leading-relaxed resize-none outline-none border-none whitespace-pre-wrap break-words overflow-wrap-anywhere selection:bg-blue-500/30"
                    style={{
                      fontSize: `${fontSize}px`,
                      lineHeight: "1.6",
                      margin: 0,
                      zIndex: 10,
                      overflowX: "hidden",
                      wordWrap: "break-word",
                    }}
                    spellCheck={false}
                    placeholder="Start typing your code here..."
                  />
                </div>
              </div>
            </div>{" "}
            {/* Preview Area */}
            <div className="w-full lg:w-1/2 bg-gradient-to-br from-gray-100 via-white to-gray-50 flex flex-col h-1/2 lg:h-auto lg:min-h-0 shadow-xl">
              {/* Preview Header */}
              <div className="bg-gradient-to-r from-gray-800/90 to-gray-700/90 backdrop-blur-sm px-4 py-5 flex items-center justify-between border-b border-gray-600/30 shadow-lg h-5">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-400 rounded-full shadow-lg"></div>
                    <div className="w-3 h-3 bg-yellow-400 rounded-full shadow-lg"></div>
                    <div className="w-3 h-3 bg-green-400 rounded-full shadow-lg"></div>
                  </div>
                  <span className="text-gray-300 text-sm font-medium bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                    LIVE PREVIEW
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-gray-400">Live</span>
                </div>
              </div>

              {/* Preview Content */}
              <div className="flex-1 bg-white overflow-auto relative shadow-inner">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-purple-50/50 pointer-events-none"></div>
                <iframe
                  id="preview-iframe"
                  srcDoc={code}
                  className="w-full h-full border-none relative z-10"
                  sandbox="allow-scripts"
                  title="Code Preview"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeEditorUI;

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
}

interface Message {
  type: "cursor" | "code";
  content?: string;
  position?: number;
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

  // ============================================================================
  // REFS
  // ============================================================================
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<MockWebSocket | null>(null);

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
  }, [code, highlightSyntax]); // ============================================================================
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
            // Simulate other users
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
                    // Position demo cursor at a random position
                    const randomPosition = Math.floor(Math.random() * 50);

                    return [
                      ...filtered,
                      {
                        id: mockUser.id,
                        position: Math.max(0, randomPosition),
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
              const message = JSON.parse(messageEvent.data) as Message;

              // Handle incoming code changes from other users
              if (
                message.type === "code" &&
                message.userId !== userId &&
                message.content
              ) {
                // Apply incoming code changes to local state
                setCode(message.content);

                // Optional: Show a brief indicator that code was updated by another user
                console.log(`Code updated by ${message.userId}`);
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
        ]);

        // Simulate incoming messages from other users for demo
        const simulateIncomingMessages = () => {
          // Simulate a code change from another user every 10 seconds
          simulationInterval = setInterval(() => {
            if (Math.random() > 0.7) {
              // 30% chance every 10 seconds
              const demoCodeChanges = [
                `<h1>Hello World</h1>\n<p>Demo User was here!</p>`,
                `<h1>Collaborative Editing</h1>\n<p>This was updated by Demo User</p>`,
                `<h1>Real-time Sync</h1>\n<p>Demo User made this change</p>\n<style>\nbody { background: #f0f0f0; }\n</style>`,
              ];

              const randomCode =
                demoCodeChanges[
                  Math.floor(Math.random() * demoCodeChanges.length)
                ];

              // Simulate receiving a message from another user
              const mockMessage = {
                type: "code" as const,
                content: randomCode,
                userId: "mock-user-1",
                timestamp: Date.now(),
              };

              // Trigger the onmessage handler
              if (mockWs.onmessage) {
                const mockEvent = {
                  data: JSON.stringify(mockMessage),
                } as MessageEvent;
                mockWs.onmessage(mockEvent);
              }
            }
          }, 10000);
        };

        // Start simulating incoming messages after a delay
        setTimeout(simulateIncomingMessages, 3000);
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
    };
  }, [userId, userColor]); // Removed 'code' dependency to prevent infinite loops

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
    sendMessage({
      type: "code",
      content: newCode,
      userId,
      timestamp: Date.now(),
    });
  };
  const handleCursorChange = (position: number) => {
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
    const paddingTop = parseInt(style.paddingTop) || 16;

    // Calculate character width based on font size
    const charWidth = fontSize * 0.6; // Monospace font character width ratio
    const lineHeight = 24; // Fixed line height

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
  };
  // Render cursor positions
  const renderCursors = () => {
    return cursors.map((cursor) => {
      const { x, y } = calculateCursorPosition(cursor.position);
      return (
        <div
          key={cursor.id}
          className="absolute pointer-events-none z-20"
          style={{
            left: `${x}px`,
            top: `${y}px`,
          }}
        >
          <div
            className="w-0.5 h-5 animate-pulse"
            style={{ backgroundColor: cursor.color }}
          />
          <div
            className="text-xs text-white px-1 py-0.5 rounded mt-1 whitespace-nowrap"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.user}
          </div>
        </div>
      );
    });
  };
  // ============================================================================
  // RENDER COMPONENT
  // ============================================================================
  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {" "}
      {/* ============================================================================ */}
      {/* HEADER SECTION */}
      {/* ============================================================================ */}
      <header className="flex items-center justify-between px-4 lg:px-6 py-3 lg:py-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 lg:w-8 lg:h-8 bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">UP</span>
          </div>
          <div className="text-white hidden sm:block">
            <div className="font-semibold text-sm lg:text-base">{userId}</div>
            <div className="text-xs text-gray-400">@userTag</div>
          </div>
        </div>
        <h1 className="text-white text-lg lg:text-xl">Code Editor</h1>
        <div className="flex items-center space-x-2 lg:space-x-3">
          {/* Connection Status */}
          <div className="flex items-center space-x-1">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-xs text-gray-400 hidden sm:inline">
              {users.length} user{users.length !== 1 ? "s" : ""}
            </span>
          </div>

          <button
            onClick={handleExport}
            className="bg-green-500 hover:bg-green-600 text-white px-3 lg:px-6 py-2 rounded flex items-center space-x-2 text-sm lg:text-base"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button
            onClick={decreaseFontSize}
            className="bg-gray-700 hover:bg-gray-600 text-white px-2 lg:px-4 py-2 rounded flex items-center space-x-1 lg:space-x-2"
          >
            <Minus size={16} />
            <span className="hidden lg:inline text-sm">Font</span>
          </button>

          <button
            onClick={increaseFontSize}
            className="bg-gray-700 hover:bg-gray-600 text-white px-2 lg:px-4 py-2 rounded flex items-center space-x-1 lg:space-x-2"
          >
            <Plus size={16} />
            <span className="hidden lg:inline text-sm">Font</span>
          </button>
        </div>{" "}
      </header>{" "}
      {/* ============================================================================ */}
      {/* MAIN EDITOR CONTENT */}
      {/* ============================================================================ */}
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        {/* Code Editor */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex flex-col lg:flex-row">
            {/* Code Section - Full height on mobile */}
            <div className="w-full lg:w-1/2 flex flex-col bg-gray-900 h-1/2 lg:h-auto lg:min-h-0">
              {/* Editor Header */}
              <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
                <span className="text-gray-400 text-sm">CODE</span>
                <div className="flex items-center space-x-2">
                  <Users size={16} className="text-gray-400" />
                  <div className="flex -space-x-1">
                    {users.map((user) => (
                      <div
                        key={user.id}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs border-2 border-gray-800"
                        style={{ backgroundColor: user.color }}
                        title={user.name}
                      >
                        {user.name[0]}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Code Area */}
              <div className="flex-1 bg-gray-900 overflow-auto relative w-full">
                {renderCursors()}
                <div className="absolute inset-0 overflow-hidden border-gray-300 bg-gray-900">
                  <div
                    ref={highlightRef}
                    className="absolute inset-0 w-full h-full bg-transparent caret-white p-4 font-mono leading-relaxed resize-none outline-none border-none whitespace-pre-wrap break-words text-gray-300 overflow-wrap-anywhere"
                    dangerouslySetInnerHTML={{ __html: highlightedCode }}
                    style={{
                      fontSize: `${fontSize}px`,
                      overflowX: "hidden", // Prevent horizontal scrolling
                      wordWrap: "break-word",
                    }}
                  />
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
                    onKeyUp={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      handleCursorChange(target.selectionStart);
                    }}
                    onScroll={syncScroll}
                    className="text-transparent absolute inset-0 w-full h-full bg-transparent caret-white p-4 font-mono leading-relaxed resize-none outline-none border-none whitespace-pre-wrap break-words overflow-wrap-anywhere"
                    style={{
                      fontSize: `${fontSize}px`,
                      lineHeight: "24px",
                      margin: 0,
                      zIndex: 10,
                      overflowX: "hidden", // Prevent horizontal scrolling
                      wordWrap: "break-word",
                    }}
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>

            {/* Preview Area - Full height on mobile */}
            <div className="w-full lg:w-1/2 bg-gray-100 flex flex-col h-1/2 lg:h-auto lg:min-h-0">
              {/* Preview Header */}
              <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
                <span className="text-gray-400 text-sm">PREVIEW</span>
              </div>

              {/* Preview Content */}
              <div className="flex-1 bg-white overflow-auto">
                <iframe
                  id="preview-iframe"
                  srcDoc={code}
                  className="w-full h-full border-none"
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

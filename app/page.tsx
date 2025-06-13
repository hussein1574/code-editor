"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { FiDownload, FiPlus, FiMinus, FiUsers } from "react-icons/fi";

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
  const [cursors] = useState<Cursor[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [userId] = useState("You");  const [lastUserEdit, setLastUserEdit] = useState<{
    timestamp: number;
    userId: string;
    position: number;
  }>({ timestamp: 0, userId: "", position: 0 });
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);

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

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 800);
  }, [userId]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const container = document.querySelector('.resize-container');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const newLeftWidth = ((e.clientX - rect.left) / rect.width) * 100;
    
    const constrainedWidth = Math.min(Math.max(newLeftWidth, 20), 80);
    setLeftPanelWidth(constrainedWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

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
  // SYNTAX HIGHLIGHTING
  // ============================================================================
  const tokenizeJavaScript = useCallback((code: string): Token[] => {
    const tokens: Token[] = [];
    const patterns = [
      { regex: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g, type: "comment" },
      { regex: /(["'`])(?:(?=(\\?))\2[\s\S])*?\1/g, type: "string" },
      { regex: /\b\d+(?:\.\d+)?\b/g, type: "number" },
      { regex: /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g, type: "identifier" },
      { regex: /[+\-*/%=<>!&|^~?:;,.(){}[\]]/g, type: "punctuation" },
      { regex: /\s+/g, type: "whitespace" },
    ];

    const usedRanges = new Set<string>();

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

    tokens.sort((a, b) => a.start - b.start);

    return tokens.map((token, index) => {
      if (token.type === "identifier") {
        if (jsKeywords.has(token.value)) {
          return { ...token, type: "keyword" };
        }
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
  }, []);

  const escapeHtml = useCallback((text: string): string => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }, []);

  const highlightJavaScriptTokens = useCallback((tokens: Token[]): string => {
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
  }, [escapeHtml]);

  const highlightSyntax = useCallback((text: string) => {
    let highlighted = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const scriptBlocks: { placeholder: string; content: string }[] = [];
    const styleBlocks: { placeholder: string; content: string }[] = [];

    highlighted = highlighted.replace(
      /(&lt;script[^&]*?&gt;)([\s\S]*?)(&lt;\/script&gt;)/gi,
      (match, openTag, content, closeTag) => {
        const placeholder = `__SCRIPT_${scriptBlocks.length}__`;
        scriptBlocks.push({ placeholder, content });
        return `${openTag}${placeholder}${closeTag}`;
      }
    );

    highlighted = highlighted.replace(
      /(&lt;style[^&]*?&gt;)([\s\S]*?)(&lt;\/style&gt;)/gi,
      (match, openTag, content, closeTag) => {
        const placeholder = `__STYLE_${styleBlocks.length}__`;
        styleBlocks.push({ placeholder, content });
        return `${openTag}${placeholder}${closeTag}`;
      }
    );

    highlighted = highlighted.replace(
      /(&lt;!--[\s\S]*?--&gt;)/g,
      '<span class="text-gray-500">$1</span>'
    );

    highlighted = highlighted.replace(
      /(&lt;\/?)(\w+)((?:\s+\w+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^'"&gt;\s]+))?)*\s*\/?)(&gt;)/g,
      (match, p1, tagName, p3, p4) => {
        const attrs = p3.replace(
          /(\w+)(\s*=\s*)(["']?)([^"']*)\3/g,
          '<span class="text-yellow-600">$1</span>$2<span class="text-green-600">$3$4$3</span>'
        );

        const tagClass =
          tagName === "script" || tagName === "style"
            ? "text-purple-600 font-semibold"
            : "text-blue-600";

        return `<span class="${tagClass}">${p1}${tagName}</span>${attrs}<span class="${tagClass}">${p4}</span>`;
      }
    );

    scriptBlocks.forEach(({ placeholder, content }) => {
      const tokens = tokenizeJavaScript(content);
      const jsHighlighted = highlightJavaScriptTokens(tokens);
      highlighted = highlighted.replace(placeholder, jsHighlighted);
    });

    styleBlocks.forEach(({ placeholder, content }) => {
      let cssHighlighted = content;

      cssHighlighted = cssHighlighted.replace(
        /(\/\*[\s\S]*?\*\/)/g,
        '<span class="text-gray-500">$1</span>'
      );

      cssHighlighted = cssHighlighted.replace(
        /((?:^|\})\s*)([^{]+)\s*\{([^}]*)\}/gm,
        (match, prefix, selector, rules) => {
          const highlightedSelector = selector.replace(
            /([.#]?[\w-:]+)/g,
            '<span class="text-blue-600">$1</span>'
          );

          let highlightedRules = rules;

          cssProperties.forEach((prop) => {
            const regex = new RegExp(`\\b(${prop})\\s*:`, "g");
            highlightedRules = highlightedRules.replace(
              regex,
              '<span class="text-purple-600">$1</span>:'
            );
          });

          highlightedRules = highlightedRules.replace(
            /:\s*([^;]+)/g,
            ': <span class="text-green-600">$1</span>'
          );

          return `${prefix}${highlightedSelector} {${highlightedRules}}`;
        }
      );

      highlighted = highlighted.replace(placeholder, cssHighlighted);
    });

    highlighted = highlighted.replace(
      /style=<span class="text-green-600">"([^"]*)"<\/span>/g,
      (match, styleContent) => {
        let highlightedStyle = styleContent;

        cssProperties.forEach((prop) => {
          const regex = new RegExp(`\\b(${prop})\\s*:`, "g");
          highlightedStyle = highlightedStyle.replace(
            regex,
            '<span class="text-purple-600">$1</span>:'
          );
        });

        highlightedStyle = highlightedStyle.replace(
          /:\s*([^;]+)/g,
          ': <span class="text-cyan-600">$1</span>'
        );

        return `style=<span class="text-green-600">"${highlightedStyle}"</span>`;
      }
    );
    
    return highlighted;
  }, [highlightJavaScriptTokens, tokenizeJavaScript]);

  useEffect(() => {
    setHighlightedCode(highlightSyntax(code));
  }, [code, highlightSyntax]);

  // ============================================================================
  // WEBSOCKET CONNECTION
  // ============================================================================
  useEffect(() => {
    setIsLoading(true);
    
    const connectWebSocket = () => {
      try {
        const mockWs: MockWebSocket = {
          send: () => {},
          close: () => {},
          onmessage: null,
          onopen: null,
          onclose: null,
          onerror: null,
        };

        wsRef.current = mockWs;
        
        setTimeout(() => {
          setIsConnected(true);
          setIsLoading(false);
          setUsers([{ id: userId, name: "You", color: userColor }]);
        }, 2000);
      } catch (error) {
        console.error("WebSocket connection failed:", error);
        setIsConnected(false);
        setIsLoading(false);
      }
    };

    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [userId, userColor]);

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================
  const sendMessage = useCallback((message: Message) => {
    if (wsRef.current && isConnected) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, [isConnected]);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    markUserAsTyping();

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
  // CURSOR POSITIONING
  // ============================================================================
  const calculateCursorPosition = (position: number) => {
    if (!textareaRef.current) {
      return { line: 0, column: 0, x: 16, y: 16 };
    }

    const textarea = textareaRef.current;
    const textBeforeCursor = code.substring(0, position);

    const style = window.getComputedStyle(textarea);
    const paddingLeft = parseInt(style.paddingLeft) || 16;
    const paddingTop = parseInt(style.paddingTop) || 16;
    const charWidth = fontSize * 0.6;
    const lineHeight = fontSize * 1.6;

    const textAreaWidth = textarea.clientWidth - paddingLeft * 2;
    const maxCharsPerLine = Math.floor(textAreaWidth / charWidth);

    const lines = textBeforeCursor.split("\n");
    let totalVisualLines = 0;
    let finalColumn = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];

      if (i === lines.length - 1) {
        const wrappedLines = Math.floor(lineText.length / maxCharsPerLine);
        totalVisualLines += wrappedLines;
        finalColumn = lineText.length % maxCharsPerLine;
      } else {
        const wrappedLines = Math.max(1, Math.ceil(lineText.length / maxCharsPerLine));
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

  const renderCursors = () => {
    return cursors.map((cursor) => {
      const { x, y } = calculateCursorPosition(cursor.position);
      return (
        <div
          key={cursor.id}
          className="absolute pointer-events-none z-20 transition-all duration-300 ease-out"
          style={{ left: `${x}px`, top: `${y}px` }}
        >
          <div
            className="w-0.5 h-6 animate-pulse shadow-lg"
            style={{
              backgroundColor: cursor.color,
              boxShadow: `0 0 10px ${cursor.color}40`,
            }}
          />
          <div
            className="text-xs text-white px-2 py-1 rounded-md mt-1 whitespace-nowrap shadow-lg backdrop-blur-sm border border-white/20 transition-all duration-300"
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
        </div>
      );
    });
  };
  // ============================================================================
  // RENDER COMPONENT
  // ============================================================================
  
  useEffect(() => {
    // Inject global styles for scrollbars and selection (since these aren't possible with Tailwind alone)
    const styleId = 'global-scrollbar-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        /* Custom scrollbar for code editor */
        .overflow-auto::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .overflow-auto::-webkit-scrollbar-track {
          background: rgba(55, 65, 81, 0.3);
          border-radius: 10px;
        }
        .overflow-auto::-webkit-scrollbar-thumb {
          background: rgba(75, 85, 99, 0.8);
          border-radius: 10px;
          border: 1px solid rgba(55, 65, 81, 0.5);
        }
        .overflow-auto::-webkit-scrollbar-thumb:hover {
          background: rgba(107, 114, 128, 0.9);
        }
        /* Selection styles */
        ::selection {
          background-color: rgba(59, 130, 246, 0.3);
          color: inherit;
        }
        ::-moz-selection {
          background-color: rgba(59, 130, 246, 0.3);
          color: inherit;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 scroll-smooth">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-gray-900/90 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-r-purple-500 rounded-full animate-spin-reverse"></div>
            </div>
            <div className="text-white text-lg font-semibold">Connecting to CodeSync Studio...</div>
            <div className="text-gray-400 text-sm">Initializing collaborative environment</div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="relative flex items-center justify-between px-3 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 bg-gradient-to-r from-gray-800/90 via-gray-700/90 to-gray-800/90 backdrop-blur-lg border-b border-gray-600/50 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5"></div>

        {/* Left section */}
        <div className="relative flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
          <div className="relative flex-shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg transform transition-transform hover:scale-105">
              <span className="text-white text-xs sm:text-sm font-bold">CE</span>
            </div>
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-400 rounded-full animate-pulse"></div>
          </div>
          <div className="text-white min-w-0 flex-1">
            <div className="font-semibold text-xs sm:text-sm lg:text-base bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent truncate">
              {userId}
            </div>
            <div className="text-xs text-gray-400 hidden sm:block">@collaborative-dev</div>
          </div>
        </div>

        {/* Center section */}
        <div className="relative flex-shrink-0 mx-2 sm:mx-4">
          <h1 className="text-sm sm:text-lg lg:text-2xl font-bold bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent whitespace-nowrap">
            <span className="hidden sm:inline">CodeSync Studio</span>
            <span className="sm:hidden">CodeSync</span>
          </h1>
          <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full"></div>
        </div>

        {/* Right section */}
        <div className="relative flex items-center space-x-1.5 sm:space-x-2 lg:space-x-3 min-w-0 flex-1 justify-end">
          {/* Connection Status */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 bg-gray-700/50 backdrop-blur-sm rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-600/50 hover:bg-gray-700/70 transition-colors">
            <div className="relative flex-shrink-0">
              <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"} shadow-lg`} />
              {isConnected && (
                <div className="absolute inset-0 w-2 h-2 bg-green-400 rounded-full animate-ping"></div>
              )}
            </div>
            <span className="text-xs text-gray-300 font-medium hidden md:inline">
              {users.length} user{users.length !== 1 ? "s" : ""} online
            </span>
            <span className="text-xs text-gray-300 font-medium md:hidden">
              {users.length}
            </span>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            className="cursor-pointer group relative bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-2 sm:px-4 lg:px-6 py-1.5 sm:py-2.5 rounded-lg hidden xs:flex items-center space-x-1 sm:space-x-2 text-xs sm:text-sm lg:text-base transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <FiDownload size={14} className="transition-transform group-hover:scale-110" />
            <span className="hidden sm:inline font-medium">Export</span>
            <div className="absolute inset-0 rounded-lg bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </button>

          {/* Font Controls */}
          <div className="flex items-center bg-gray-700/50 backdrop-blur-sm rounded-lg border border-gray-600/50 overflow-hidden hover:bg-gray-700/70 transition-colors">
            <button
              onClick={decreaseFontSize}
              className="cursor-pointer bg-transparent hover:bg-gray-600/50 text-white px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2.5 flex items-center space-x-1 transition-colors border-r border-gray-600/50"
            >
              <FiMinus size={12} />
              <span className="hidden lg:inline text-xs font-medium">A</span>
            </button>

            <div className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-white text-xs sm:text-sm font-mono bg-gray-800/50 min-w-0">
              <span className="hidden sm:inline">{fontSize}px</span>
              <span className="sm:hidden">{fontSize}</span>
            </div>

            <button
              onClick={increaseFontSize}
              className="cursor-pointer bg-transparent hover:bg-gray-600/50 text-white px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2.5 flex items-center space-x-1 transition-colors border-l border-gray-600/50"
            >
              <FiPlus size={12} />
              <span className="hidden lg:inline text-sm font-medium">A</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row relative resize-container">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 pointer-events-none"></div>

        <div className="flex-1 flex flex-col relative z-10">
          <div className="flex-1 flex flex-col lg:flex-row relative">
            {/* Code Section */}
            <div 
              className="flex flex-col bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-sm border-r border-gray-600/30 transition-all duration-200 h-1/2 lg:h-auto"
              style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${leftPanelWidth}%` : '100%' }}
            >
              {/* Editor Header */}
              <div className="bg-gradient-to-r from-gray-800/90 to-gray-700/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b border-gray-600/30 shadow-lg min-h-[2.5rem] hover:bg-gray-700/90 transition-colors">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-400 rounded-full shadow-lg hover:scale-110 transition-transform cursor-pointer"></div>
                    <div className="w-3 h-3 bg-yellow-400 rounded-full shadow-lg hover:scale-110 transition-transform cursor-pointer"></div>
                    <div className="w-3 h-3 bg-green-400 rounded-full shadow-lg hover:scale-110 transition-transform cursor-pointer"></div>
                  </div>
                  <span className="text-sm font-medium bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    CODE EDITOR
                  </span>
                  {isTyping && (
                    <div className="flex items-center space-x-1 animate-fade-in">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                      <span className="text-xs text-blue-400 ml-1">typing...</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2 bg-gray-700/50 rounded-lg px-2 py-0.5 border border-gray-600/50 hover:bg-gray-600/50 transition-colors">
                    <FiUsers size={12} className="text-blue-400" />
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
              </div>

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
                  />
                  
                  <textarea
                    ref={textareaRef}
                    value={code}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    onSelect={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      handleCursorChange(target.selectionStart);
                    }}
                    onClick={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      handleCursorChange(target.selectionStart);
                    }}
                    onKeyDown={() => markUserAsTyping()}
                    onKeyUp={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      handleCursorChange(target.selectionStart);
                    }}
                    onFocus={() => markUserAsTyping()}
                    onBlur={() => {
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
            </div>

            {/* Resize Handle */}
            <div 
              className="hidden lg:block relative w-1 bg-gray-600/30 hover:bg-blue-500/50 cursor-ew-resize transition-colors group"
              onMouseDown={handleMouseDown}
            >
              <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center">
                <div className="w-1 h-8 bg-gray-600/50 group-hover:bg-blue-500/70 transition-colors rounded-full shadow-lg"></div>
              </div>
            </div>

            {/* Preview Area */}
            <div 
              className="flex flex-col bg-gradient-to-br from-gray-100 via-white to-gray-50 shadow-xl transition-all duration-200 h-1/2 lg:h-auto"
              style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${100 - leftPanelWidth}%` : '100%' }}
            >
              {/* Preview Header */}
              <div className="bg-gradient-to-r from-gray-800/90 to-gray-700/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b border-gray-600/30 shadow-lg min-h-[2.5rem] hover:bg-gray-700/90 transition-colors">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-400 rounded-full shadow-lg hover:scale-110 transition-transform cursor-pointer"></div>
                    <div className="w-3 h-3 bg-yellow-400 rounded-full shadow-lg hover:scale-110 transition-transform cursor-pointer"></div>
                    <div className="w-3 h-3 bg-green-400 rounded-full shadow-lg hover:scale-110 transition-transform cursor-pointer"></div>
                  </div>
                  <span className="text-sm font-medium bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                    LIVE PREVIEW
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-gray-400">Live</span>
                </div>
              </div>

              {/* Preview Content */}
              <div className="flex-1 bg-white overflow-auto relative shadow-inner hover:shadow-2xl transition-shadow">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-purple-50/50 pointer-events-none"></div>
                <iframe                  id="preview-iframe"
                  srcDoc={code}
                  className="w-full h-full border-none relative z-10 transition-opacity duration-300"
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

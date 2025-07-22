"use client";
import { useState, useEffect, useRef } from "react";
import React from "react";

import { useHandleStreamResponse } from "../utilities/runtime-helpers";

function MainComponent() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a helpful AI assistant. Be creative, informative, and engaging in your responses. Always respond in the same language as the user\'s message. When users ask you to draw, create, generate, or make images, respond with the exact format: IMAGE_PROMPT: [detailed description]. For example: "IMAGE_PROMPT: a majestic dragon flying over a medieval castle at sunset, ultra realistic, 8k, detailed"'
  );
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageWidth, setImageWidth] = useState(1024);
  const [imageHeight, setImageHeight] = useState(1024);
  const [imageQuality, setImageQuality] = useState("ultra");
  const [upscaleLevel, setUpscaleLevel] = useState(2);
  const [processingSteps, setProcessingSteps] = useState(50);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const [detectedLanguage, setDetectedLanguage] = useState("en");
  const [userLanguage, setUserLanguage] = useState("en");
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [chatSessions, setChatSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);

  const detectLanguage = async (text) => {
    try {
      const response = await fetch(
        "/integrations/google-translate/language/translate/v2",
        {
          method: "POST",
          body: new URLSearchParams({
            q: text,
            target: "en",
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        return "auto";
      }
    } catch (error) {
      console.error("Language detection error:", error);
    }
    return "en";
  };

  const translateText = async (text, targetLanguage, sourceLanguage = null) => {
    try {
      const params = new URLSearchParams({
        q: text,
        target: targetLanguage,
      });

      if (sourceLanguage) {
        params.append("source", sourceLanguage);
      }

      const response = await fetch(
        "/integrations/google-translate/language/translate/v2",
        {
          method: "POST",
          body: params,
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.data.translations[0].translatedText;
      }
    } catch (error) {
      console.error("Translation error:", error);
    }
    return text;
  };

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setSidebarOpen(false);
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleFinish = React.useCallback(
    async (message) => {
      if (message.includes("IMAGE_PROMPT:")) {
        const promptMatch = message.match(/IMAGE_PROMPT:\s*(.+)/);
        if (promptMatch) {
          const imagePrompt = promptMatch[1].trim();
          generateImage(imagePrompt);
          return;
        }
      }

      let finalMessage = message;
      if (userLanguage !== "en") {
        try {
          finalMessage = await translateText(message, userLanguage, "en");
        } catch (error) {
          console.error("Translation error:", error);
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: finalMessage },
      ]);
      setStreamingMessage("");
      setIsLoading(false);
    },
    [userLanguage]
  );

  const handleStreamResponse = useHandleStreamResponse({
    onChunk: setStreamingMessage,
    onFinish: handleFinish,
  });

  const generateImage = async (prompt) => {
    setIsGeneratingImage(true);
    setImageProgress(0);

    try {
      const qualityModifiers = {
        standard: "high quality, detailed",
        enhanced:
          "ultra realistic, 8k, high quality, detailed, professional photography",
        ultra:
          "ultra realistic, 8k, high quality, detailed, professional photography, masterpiece, award winning, cinematic lighting, perfect composition, sharp focus, hyperdetailed",
      };

      const enhancedPrompt = `${prompt}, ${qualityModifiers[imageQuality]}`;

      const progressInterval = setInterval(() => {
        setImageProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 15;
        });
      }, 500);

      const encodedPrompt = encodeURIComponent(enhancedPrompt);

      const finalWidth = imageWidth * upscaleLevel;
      const finalHeight = imageHeight * upscaleLevel;

      const response = await fetch(
        `/integrations/stable-diffusion-v-3/?prompt=${encodedPrompt}&width=${finalWidth}&height=${finalHeight}`,
        {
          method: "GET",
        }
      );

      clearInterval(progressInterval);
      setImageProgress(100);

      if (!response.ok) {
        throw new Error(`Image generation failed: ${response.status}`);
      }

      const data = await response.json();
      if (data.data && data.data[0]) {
        const imageUrl = data.data[0];

        await new Promise((resolve) => setTimeout(resolve, 2000));

        const imageMessage = {
          role: "assistant",
          content: `I've generated an ultra-realistic ${finalWidth}x${finalHeight} image for you: "${prompt}"`,
          image: imageUrl,
          imagePrompt: prompt,
          imageSpecs: {
            width: finalWidth,
            height: finalHeight,
            quality: imageQuality,
            upscale: upscaleLevel,
            steps: processingSteps,
          },
        };
        setMessages((prev) => [...prev, imageMessage]);
      }
    } catch (error) {
      console.error("Image generation error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I encountered an error generating the image. Please try again with different settings.",
        },
      ]);
    } finally {
      setIsGeneratingImage(false);
      setImageProgress(0);
      setStreamingMessage("");
      setIsLoading(false);
    }
  };

  const downloadImage = async (imageUrl, prompt, specs) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = `ai-generated-${prompt
        .slice(0, 30)
        .replace(/[^a-zA-Z0-9]/g, "-")}-${specs.width}x${
        specs.height
      }-${Date.now()}.jpg`;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const inputLanguage = await detectLanguage(input.trim());

    if (messages.length === 0) {
      setUserLanguage(inputLanguage);
      setDetectedLanguage(inputLanguage);
    }

    const userMessage = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const languageInstruction =
        userLanguage !== "en"
          ? `Always respond in the user's language. The user is communicating in language code: ${userLanguage}. `
          : "";

      const enhancedSystemPrompt = languageInstruction + systemPrompt;

      const messagesToSend = [
        { role: "system", content: enhancedSystemPrompt },
        ...newMessages,
      ];

      const response = await fetch("/integrations/google-gemini-1-5/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesToSend,
          stream: true,
          temperature: temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      handleStreamResponse(response);
    } catch (error) {
      console.error("Error:", error);

      let errorMessage = "Sorry, I encountered an error. Please try again.";
      if (userLanguage !== "en") {
        try {
          errorMessage = await translateText(errorMessage, userLanguage, "en");
        } catch (translationError) {
          console.error("Error message translation failed:", translationError);
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: errorMessage,
        },
      ]);
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setStreamingMessage("");
  };

  const exportChat = () => {
    const chatData = {
      messages,
      timestamp: new Date().toISOString(),
      settings: {
        temperature,
        maxTokens,
        systemPrompt,
        imageWidth,
        imageHeight,
        imageQuality,
        upscaleLevel,
        processingSteps,
      },
    };
    const blob = new Blob([JSON.stringify(chatData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatMessage = (content) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(
        /`(.*?)`/g,
        '<code class="bg-gray-200 dark:bg-gray-700 px-1 rounded">$1</code>'
      )
      .replace(/\n/g, "<br>");
  };

  const SidebarContent = () => (
    <div className="space-y-6">
      <div
        className={`p-4 rounded-2xl ${
          darkMode
            ? "bg-gradient-to-br from-purple-900/50 to-purple-800/30 border border-purple-700/30"
            : "bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200"
        } backdrop-blur-sm`}
      >
        <div
          className={`text-sm ${
            darkMode ? "text-purple-300" : "text-purple-800"
          }`}
        >
          <div className="flex items-center mb-3">
            <div className="w-10 h-10 bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg transform hover:scale-105 transition-all duration-300 border-2 border-white/20">
              <i className="fas fa-brain text-white text-lg"></i>
            </div>
            <div className="ml-3">
              <strong className="text-base">Image Generation</strong>
            </div>
          </div>
          <p className="text-xs leading-relaxed">
            Ask me to "draw", "create", "generate", or "make" an image and I'll
            create ultra-realistic artwork with advanced upscaling and
            professional quality!
          </p>
        </div>
      </div>

      <div
        className={`p-5 rounded-2xl ${
          darkMode
            ? "bg-gradient-to-br from-slate-900/60 to-slate-800/40 border border-slate-700/40"
            : "bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200"
        } backdrop-blur-sm`}
      >
        <div
          className={`text-sm ${
            darkMode ? "text-slate-300" : "text-slate-800"
          }`}
        >
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 rounded-xl flex items-center justify-center shadow-lg mr-3 border-2 border-white/10">
              <i className="fas fa-building text-white text-lg"></i>
            </div>
            <div>
              <strong className="text-base font-bold">
                Company Information
              </strong>
              <p className="text-xs opacity-75">Professional AI Solutions</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg flex items-center justify-center mr-3 shadow-md">
                <i className="fas fa-user-tie text-white text-sm"></i>
              </div>
              <div>
                <p className="font-semibold text-xs">CEO & Founder</p>
                <p className="text-xs font-bold">Amir Kendil</p>
              </div>
            </div>

            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-r from-green-600 to-green-700 rounded-lg flex items-center justify-center mr-3 shadow-md">
                <i className="fas fa-globe text-white text-sm"></i>
              </div>
              <div>
                <p className="font-semibold text-xs">Website</p>
                <p className="text-xs">www.kendiltech.com</p>
              </div>
            </div>

            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-600 to-purple-700 rounded-lg flex items-center justify-center mr-3 shadow-md">
                <i className="fas fa-envelope text-white text-sm"></i>
              </div>
              <div>
                <p className="font-semibold text-xs">Contact</p>
                <p className="text-xs">info@kendiltech.com</p>
              </div>
            </div>

            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-r from-orange-600 to-orange-700 rounded-lg flex items-center justify-center mr-3 shadow-md">
                <i className="fas fa-industry text-white text-sm"></i>
              </div>
              <div>
                <p className="font-semibold text-xs">Industry</p>
                <p className="text-xs">AI & Technology Solutions</p>
              </div>
            </div>

            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-r from-red-600 to-red-700 rounded-lg flex items-center justify-center mr-3 shadow-md">
                <i className="fas fa-calendar text-white text-sm"></i>
              </div>
              <div>
                <p className="font-semibold text-xs">Established</p>
                <p className="text-xs">2024</p>
              </div>
            </div>
          </div>

          <div
            className={`mt-4 pt-3 border-t ${
              darkMode ? "border-slate-700/50" : "border-slate-300/50"
            }`}
          >
            <p className="text-xs leading-relaxed opacity-90">
              <strong>Kendil Technologies</strong> specializes in cutting-edge
              AI solutions, delivering innovative artificial intelligence and
              machine learning technologies for businesses worldwide.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const startEditingMessage = (messageIndex, currentContent) => {
    setEditingMessageId(messageIndex);
    setEditingText(currentContent);
  };

  const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const saveEditedMessage = async (messageIndex) => {
    if (!editingText.trim()) return;

    const updatedMessages = [...messages];
    updatedMessages[messageIndex] = {
      ...updatedMessages[messageIndex],
      content: editingText.trim(),
    };

    const messagesToKeep = updatedMessages.slice(0, messageIndex + 1);
    setMessages(messagesToKeep);

    setEditingMessageId(null);
    setEditingText("");

    if (updatedMessages[messageIndex].role === "user") {
      setIsLoading(true);

      try {
        const inputLanguage = await detectLanguage(editingText.trim());
        setUserLanguage(inputLanguage);

        const languageInstruction =
          inputLanguage !== "en"
            ? `Always respond in the user's language. The user is communicating in language code: ${inputLanguage}. `
            : "";

        const enhancedSystemPrompt = languageInstruction + systemPrompt;

        const messagesToSend = [
          { role: "system", content: enhancedSystemPrompt },
          ...messagesToKeep,
        ];

        const response = await fetch("/integrations/google-gemini-1-5/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: messagesToSend,
            stream: true,
            temperature: temperature,
            max_tokens: maxTokens,
          }),
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        handleStreamResponse(response);
      } catch (error) {
        console.error("Error:", error);

        let errorMessage = "Sorry, I encountered an error. Please try again.";
        if (userLanguage !== "en") {
          try {
            errorMessage = await translateText(
              errorMessage,
              userLanguage,
              "en"
            );
          } catch (translationError) {
            console.error(
              "Error message translation failed:",
              translationError
            );
          }
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: errorMessage,
          },
        ]);
        setIsLoading(false);
      }
    }
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        darkMode ? "dark bg-gray-900" : "bg-gray-50"
      }`}
    >
      <div
        className={`border-b ${
          darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
        } p-4`}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode
                    ? "bg-gray-700 text-white hover:bg-gray-600"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <i className="fas fa-bars"></i>
              </button>
            )}
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-robot text-white text-sm"></i>
            </div>
            <h1
              className={`text-xl font-bold ${
                darkMode ? "text-white" : "text-gray-900"
              } ${isMobile ? "text-lg" : ""}`}
            >
              AI Chat & Image Generator
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg transition-colors ${
                darkMode
                  ? "bg-gray-700 text-yellow-400 hover:bg-gray-600"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <i className={`fas ${darkMode ? "fa-sun" : "fa-moon"}`}></i>
            </button>
            <button
              onClick={exportChat}
              className={`p-2 rounded-lg transition-colors ${
                darkMode
                  ? "bg-gray-700 text-blue-400 hover:bg-gray-600"
                  : "bg-gray-100 text-blue-600 hover:bg-gray-200"
              }`}
            >
              <i className="fas fa-download"></i>
            </button>
            <button
              onClick={clearChat}
              className={`p-2 rounded-lg transition-colors ${
                darkMode
                  ? "bg-gray-700 text-red-400 hover:bg-gray-600"
                  : "bg-gray-100 text-red-600 hover:bg-gray-200"
              }`}
            >
              <i className="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto flex h-[calc(100vh-80px)] relative">
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div
          className={`${
            isMobile
              ? `fixed left-0 top-[80px] h-[calc(100vh-80px)] w-80 z-50 transform transition-transform ${
                  sidebarOpen ? "translate-x-0" : "-translate-x-full"
                }`
              : "w-80 border-r"
          } ${
            darkMode
              ? "border-gray-700 bg-gray-800"
              : "border-gray-200 bg-white"
          } p-4 overflow-y-auto`}
        >
          <h3
            className={`font-semibold mb-4 ${
              darkMode ? "text-white" : "text-gray-900"
            }`}
          >
            <i className="fas fa-cog mr-2"></i>Settings
          </h3>
          <SidebarContent />
        </div>

        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div
                className={`text-center py-12 ${
                  darkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                <i className="fas fa-comments text-4xl mb-4"></i>
                <h3 className="text-lg font-medium mb-2">
                  {userLanguage === "ar"
                    ? "ابدأ محادثة"
                    : userLanguage === "es"
                    ? "Iniciar una conversación"
                    : userLanguage === "fr"
                    ? "Commencer une conversation"
                    : userLanguage === "de"
                    ? "Ein Gespräch beginnen"
                    : userLanguage === "it"
                    ? "Inizia una conversazione"
                    : userLanguage === "pt"
                    ? "Iniciar uma conversa"
                    : userLanguage === "ru"
                    ? "Начать разговор"
                    : userLanguage === "ja"
                    ? "会話を始める"
                    : userLanguage === "ko"
                    ? "대화 시작"
                    : userLanguage === "zh"
                    ? "开始对话"
                    : "Start a conversation"}
                </h3>
                <p className={`${isMobile ? "text-sm" : ""}`}>
                  {userLanguage === "ar"
                    ? "اسألني أي شيء أو اطلب إنشاء صور واقعية فائقة الجودة!"
                    : userLanguage === "es"
                    ? "¡Pregúntame cualquier cosa o solicita generación de imágenes ultra realistas!"
                    : userLanguage === "fr"
                    ? "Demandez-moi n'importe quoi ou demandez la génération d'images ultra-réalistes!"
                    : userLanguage === "de"
                    ? "Fragen Sie mich alles oder fordern Sie ultra-realistische Bildgenerierung an!"
                    : userLanguage === "it"
                    ? "Chiedimi qualsiasi cosa o richiedi la generazione di immagini ultra-realistiche!"
                    : userLanguage === "pt"
                    ? "Pergunte-me qualquer coisa ou solicite geração de imagens ultra-realistas!"
                    : userLanguage === "ru"
                    ? "Спросите меня о чем угодно или запросите генерацию ультра-реалистичных изображений!"
                    : userLanguage === "ja"
                    ? "何でも聞いてください、または超リアルな画像生成をリクエストしてください！"
                    : userLanguage === "ko"
                    ? "무엇이든 물어보시거나 초현실적인 이미지 생성을 요청하세요!"
                    : userLanguage === "zh"
                    ? "问我任何问题或请求超逼真图像生成！"
                    : "Ask me anything or request ultra-realistic image generation!"}
                </p>
                <div className="mt-4 space-y-2 text-sm">
                  <p className="font-medium">
                    {userLanguage === "ar"
                      ? "جرب قول:"
                      : userLanguage === "es"
                      ? "Intenta decir:"
                      : userLanguage === "fr"
                      ? "Essayez de dire:"
                      : userLanguage === "de"
                      ? "Versuchen Sie zu sagen:"
                      : userLanguage === "it"
                      ? "Prova a dire:"
                      : userLanguage === "pt"
                      ? "Tente dizer:"
                      : userLanguage === "ru"
                      ? "Попробуйте сказать:"
                      : userLanguage === "ja"
                      ? "試しに言ってみてください:"
                      : userLanguage === "ko"
                      ? "말해보세요:"
                      : userLanguage === "zh"
                      ? "试着说:"
                      : "Try saying:"}
                  </p>
                  <p>
                    {userLanguage === "ar"
                      ? '"ارسم مدينة مستقبلية عند غروب الشمس"'
                      : userLanguage === "es"
                      ? '"Dibuja una ciudad futurista al atardecer"'
                      : userLanguage === "fr"
                      ? '"Dessine une ville futuriste au coucher du soleil"'
                      : userLanguage === "de"
                      ? '"Zeichne eine futuristische Stadt bei Sonnenuntergang"'
                      : userLanguage === "it"
                      ? '"Disegna una città futuristica al tramonto"'
                      : userLanguage === "pt"
                      ? '"Desenhe uma cidade futurística ao pôr do sol"'
                      : userLanguage === "ru"
                      ? '"Нарисуй футуристический город на закате"'
                      : userLanguage === "ja"
                      ? '"夕日の未来都市を描いて"'
                      : userLanguage === "ko"
                      ? '"일몰의 미래 도시를 그려줘"'
                      : userLanguage === "zh"
                      ? '"画一个日落时的未来城市"'
                      : '"Draw a futuristic city at sunset"'}
                  </p>
                  <p>
                    {userLanguage === "ar"
                      ? '"أنشئ صورة لساحر حكيم"'
                      : userLanguage === "es"
                      ? '"Crea un retrato de un mago sabio"'
                      : userLanguage === "fr"
                      ? '"Crée un portrait d\'un sage magicien"'
                      : userLanguage === "de"
                      ? '"Erstelle ein Porträt eines weisen Zauberers"'
                      : userLanguage === "it"
                      ? '"Crea un ritratto di un mago saggio"'
                      : userLanguage === "pt"
                      ? '"Crie um retrato de um mago sábio"'
                      : userLanguage === "ru"
                      ? '"Создай портрет мудрого волшебника"'
                      : userLanguage === "ja"
                      ? '"賢い魔法使いの肖像画を作って"'
                      : userLanguage === "ko"
                      ? '"현명한 마법사의 초상화를 만들어줘"'
                      : userLanguage === "zh"
                      ? '"创建一个智慧巫师的肖像"'
                      : '"Create a portrait of a wise wizard"'}
                  </p>
                  <p>
                    {userLanguage === "ar"
                      ? '"اصنع منظر طبيعي بالجبال"'
                      : userLanguage === "es"
                      ? '"Genera un paisaje con montañas"'
                      : userLanguage === "fr"
                      ? '"Génère un paysage avec des montagnes"'
                      : userLanguage === "de"
                      ? '"Generiere eine Landschaft mit Bergen"'
                      : userLanguage === "it"
                      ? '"Genera un paesaggio con montagne"'
                      : userLanguage === "pt"
                      ? '"Gere uma paisagem com montanhas"'
                      : userLanguage === "ru"
                      ? '"Создай пейзаж с горами"'
                      : userLanguage === "ja"
                      ? '"山のある風景を生成して"'
                      : userLanguage === "ko"
                      ? '"산이 있는 풍경을 생성해줘"'
                      : userLanguage === "zh"
                      ? '"生成一个有山的风景"'
                      : '"Generate a landscape with mountains"'}
                  </p>
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`${
                    isMobile ? "max-w-[90%]" : "max-w-[80%]"
                  } rounded-lg p-4 ${
                    message.role === "user"
                      ? "bg-blue-500 text-white"
                      : darkMode
                      ? "bg-gray-700 text-gray-100"
                      : "bg-white text-gray-900 border border-gray-200"
                  } relative group`}
                >
                  <div className="flex items-start space-x-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        message.role === "user"
                          ? "bg-blue-600"
                          : "bg-gradient-to-r from-purple-500 to-blue-500"
                      }`}
                    >
                      <i
                        className={`fas ${
                          message.role === "user" ? "fa-user" : "fa-robot"
                        } text-white`}
                      ></i>
                    </div>
                    <div className="flex-1">
                      {editingMessageId === index ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className={`w-full p-2 rounded border resize-none ${
                              darkMode
                                ? "bg-gray-600 border-gray-500 text-white placeholder-gray-400"
                                : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                            } focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              userLanguage === "ar" ? "text-right" : "text-left"
                            }`}
                            rows="3"
                            style={{
                              direction: userLanguage === "ar" ? "rtl" : "ltr",
                            }}
                            autoFocus
                          />
                          <div className="flex space-x-2">
                            <button
                              onClick={() => saveEditedMessage(index)}
                              className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 transition-colors"
                            >
                              <i className="fas fa-check mr-1"></i>
                              {userLanguage === "ar"
                                ? "حفظ"
                                : userLanguage === "es"
                                ? "Guardar"
                                : userLanguage === "fr"
                                ? "Sauvegarder"
                                : userLanguage === "de"
                                ? "Speichern"
                                : userLanguage === "it"
                                ? "Salva"
                                : userLanguage === "pt"
                                ? "Salvar"
                                : userLanguage === "ru"
                                ? "Сохранить"
                                : userLanguage === "ja"
                                ? "保存"
                                : userLanguage === "ko"
                                ? "저장"
                                : userLanguage === "zh"
                                ? "保存"
                                : "Save"}
                            </button>
                            <button
                              onClick={cancelEditingMessage}
                              className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 transition-colors"
                            >
                              <i className="fas fa-times mr-1"></i>
                              {userLanguage === "ar"
                                ? "إلغاء"
                                : userLanguage === "es"
                                ? "Cancelar"
                                : userLanguage === "fr"
                                ? "Annuler"
                                : userLanguage === "de"
                                ? "Abbrechen"
                                : userLanguage === "it"
                                ? "Annulla"
                                : userLanguage === "pt"
                                ? "Cancelar"
                                : userLanguage === "ru"
                                ? "Отмена"
                                : userLanguage === "ja"
                                ? "キャンセル"
                                : userLanguage === "ko"
                                ? "취소"
                                : userLanguage === "zh"
                                ? "取消"
                                : "Cancel"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          dangerouslySetInnerHTML={{
                            __html: formatMessage(message.content),
                          }}
                        />
                      )}
                      {message.image && (
                        <div className="mt-3">
                          <img
                            src={message.image}
                            alt={message.imagePrompt}
                            className="max-w-full h-auto rounded-lg shadow-lg"
                            style={{ maxHeight: isMobile ? "300px" : "400px" }}
                          />
                          {message.imageSpecs && (
                            <div
                              className={`mt-2 text-xs ${
                                darkMode ? "text-gray-400" : "text-gray-600"
                              }`}
                            >
                              <i className="fas fa-info-circle mr-1"></i>
                              {message.imageSpecs.width}×
                              {message.imageSpecs.height}px •
                              {message.imageSpecs.quality} quality •
                              {message.imageSpecs.upscale}x upscaled
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              onClick={() =>
                                downloadImage(
                                  message.image,
                                  message.imagePrompt,
                                  message.imageSpecs
                                )
                              }
                              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors"
                            >
                              <i className="fas fa-download mr-1"></i>Download
                              HD
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(message.image);
                                alert("Image URL copied to clipboard!");
                              }}
                              className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 transition-colors"
                            >
                              <i className="fas fa-copy mr-1"></i>Copy URL
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {message.role === "user" && editingMessageId !== index && (
                    <button
                      onClick={() =>
                        startEditingMessage(index, message.content)
                      }
                      className={`absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded ${
                        darkMode
                          ? "bg-gray-600 text-gray-300 hover:bg-gray-500"
                          : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                      }`}
                      title={
                        userLanguage === "ar"
                          ? "تحرير الرسالة"
                          : userLanguage === "es"
                          ? "Editar mensaje"
                          : userLanguage === "fr"
                          ? "Modificar el mensaje"
                          : userLanguage === "de"
                          ? "Nachricht bearbeiten"
                          : userLanguage === "it"
                          ? "Modifica messaggio"
                          : userLanguage === "pt"
                          ? "Editar mensagem"
                          : userLanguage === "ru"
                          ? "Редактировать сообщение"
                          : userLanguage === "ja"
                          ? "メッセージを編集"
                          : userLanguage === "ko"
                          ? "메시지 편집"
                          : userLanguage === "zh"
                          ? "编辑消息"
                          : "Edit message"
                      }
                    >
                      <i className="fas fa-edit text-xs"></i>
                    </button>
                  )}
                </div>
              </div>
            ))}

            {streamingMessage && (
              <div className="flex justify-start">
                <div
                  className={`rounded-lg p-4 ${
                    darkMode ? "bg-gray-700" : "bg-white border border-gray-200"
                  }`}
                >
                  <div className="flex items-start space-x-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs bg-gradient-to-r from-purple-500 to-blue-500">
                      <i className="fas fa-robot text-white"></i>
                    </div>
                    <div
                      className="flex-1"
                      dangerouslySetInnerHTML={{
                        __html: formatMessage(streamingMessage),
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {(isLoading || isGeneratingImage) && !streamingMessage && (
              <div className="flex justify-start">
                <div
                  className={`rounded-lg p-4 ${
                    darkMode ? "bg-gray-700" : "bg-white border border-gray-200"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs bg-gradient-to-r from-purple-500 to-blue-500">
                      <i
                        className={`fas ${
                          isGeneratingImage ? "fa-palette" : "fa-robot"
                        } text-white`}
                      ></i>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isGeneratingImage && imageProgress > 0 ? (
                        <div className="flex items-center space-x-2">
                          <div
                            className={`w-32 h-2 rounded-full ${
                              darkMode ? "bg-gray-600" : "bg-gray-300"
                            }`}
                          >
                            <div
                              className="h-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-500"
                              style={{ width: `${imageProgress}%` }}
                            ></div>
                          </div>
                          <span
                            className={`text-sm ${
                              darkMode ? "text-gray-300" : "text-gray-600"
                            }`}
                          >
                            {Math.round(imageProgress)}%
                          </span>
                        </div>
                      ) : (
                        <div className="flex space-x-1">
                          <div
                            className={`w-2 h-2 rounded-full animate-pulse ${
                              darkMode ? "bg-gray-400" : "bg-gray-500"
                            }`}
                          ></div>
                          <div
                            className={`w-2 h-2 rounded-full animate-pulse ${
                              darkMode ? "bg-gray-400" : "bg-gray-500"
                            }`}
                            style={{ animationDelay: "0.2s" }}
                          ></div>
                          <div
                            className={`w-2 h-2 rounded-full animate-pulse ${
                              darkMode ? "bg-gray-400" : "bg-gray-500"
                            }`}
                            style={{ animationDelay: "0.4s" }}
                          ></div>
                        </div>
                      )}
                      <span
                        className={`text-sm ${
                          darkMode ? "text-gray-300" : "text-gray-600"
                        }`}
                      >
                        {isGeneratingImage
                          ? "Generating ultra-realistic image..."
                          : "Thinking..."}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div
            className={`border-t ${
              darkMode
                ? "border-gray-700 bg-gray-800"
                : "border-gray-200 bg-white"
            } p-4`}
          >
            <div
              className={`flex ${
                isMobile ? "flex-col space-y-2" : "space-x-3"
              }`}
            >
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={
                    userLanguage === "ar"
                      ? "اكتب رسالتك أو اطلب مني رسم شيء... (Shift+Enter للسطر الجديد)"
                      : userLanguage === "es"
                      ? "Escribe tu mensaje o pídeme que dibuje algo... (Shift+Enter para nueva línea)"
                      : userLanguage === "fr"
                      ? "Tapez votre message ou demandez-moi de dessiner quelque chose... (Shift+Entrée pour nouvelle ligne)"
                      : userLanguage === "de"
                      ? "Geben Sie Ihre Nachricht ein oder bitten Sie mich, etwas zu zeichnen... (Shift+Enter für neue Zeile)"
                      : userLanguage === "it"
                      ? "Digita il tuo messaggio o chiedimi di disegnare qualcosa... (Shift+Invio per nuova riga)"
                      : userLanguage === "pt"
                      ? "Digite sua mensagem ou peça para eu desenhar algo... (Shift+Enter para nova linha)"
                      : userLanguage === "ru"
                      ? "Введите ваше сообщение или попросите меня что-то нарисовать... (Shift+Enter для новой строки)"
                      : userLanguage === "ja"
                      ? "メッセージを入力するか、何かを描くように頼んでください... (Shift+Enterで改行)"
                      : userLanguage === "ko"
                      ? "메시지를 입력하거나 무언가를 그려달라고 요청하세요... (Shift+Enter로 줄바꿈)"
                      : userLanguage === "zh"
                      ? "输入您的消息或要求我画些什么... (Shift+Enter换行)"
                      : "Type your message or ask me to draw something... (Shift+Enter for new line)"
                  }
                  className={`w-full p-3 pr-12 rounded-lg border resize-none ${
                    darkMode
                      ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                  } focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    userLanguage === "ar" ? "text-right" : "text-left"
                  }`}
                  rows="1"
                  style={{
                    minHeight: "48px",
                    maxHeight: "120px",
                    direction: userLanguage === "ar" ? "rtl" : "ltr",
                  }}
                />
                <div className="absolute right-3 top-3 text-xs text-gray-400">
                  {input.length}/4000
                </div>
              </div>
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading || isGeneratingImage}
                className={`${
                  isMobile ? "w-full" : ""
                } px-6 py-3 rounded-lg font-medium transition-all ${
                  !input.trim() || isLoading || isGeneratingImage
                    ? darkMode
                      ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600 transform hover:scale-105"
                }`}
              >
                {isLoading || isGeneratingImage ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  <i className="fas fa-paper-plane"></i>
                )}
                {isMobile && <span className="ml-2">Send</span>}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-pulse {
          animation: pulse 1.5s ease-in-out infinite;
        }
        textarea {
          field-sizing: content;
        }
        code {
          font-family: 'Courier New', monospace;
        }
        @media (max-width: 768px) {
          .max-w-6xl {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

export default MainComponent;

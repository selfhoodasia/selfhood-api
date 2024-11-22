"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { ChevronRight } from "lucide-react";

// Types
type Role = "user" | "assistant";

interface Message {
  role: Role;
  content: string;
}

interface Source {
  slug: string;
  name: string;
}

interface ChatResponse {
  answer: string;
  sources: Source[];
  followUpQuestions: string[];
}

const INITIAL_QUESTIONS = [
  "Do you offer showroom services?",
  "Can you share a recent project?",
  "What type of brands do you work with?",
  "What countries do you work in?",
  "How can you help my brand?",
  "What services do you provide?",
];

const QuestionCarousel = ({
  questions,
  onSelect,
  disabled,
}: {
  questions: string[];
  onSelect: (question: string) => void;
  disabled: boolean;
}) => (
  <Card className="border-none shadow-none bg-transparent">
    <CardContent className="p-0">
      <Carousel className="w-full" opts={{ slidesToScroll: 1, align: "start" }}>
        <CarouselContent className="-ml-2 md:-ml-4">
          {questions.map((question, idx) => (
            <CarouselItem key={idx} className="pl-2 md:pl-4 basis-auto">
              <Button
                variant="outline"
                onClick={() => onSelect(question)}
                disabled={disabled}
                className="rounded-[12px] text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
              >
                {question}
              </Button>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="hidden" />
        <CarouselNext className="hidden" />
      </Carousel>
    </CardContent>
  </Card>
);

const SourcesList = ({ sources }: { sources: Source[] }) => (
  <div className="mt-4 space-y-2">
    {sources.map((source, idx) => (
      <Button
        key={idx}
        variant="outline"
        asChild
        className="rounded-[12px] border-gray-200 hover:bg-gray-50 text-gray-600"
      >
        <a href={`/${source.slug}`}>
          <span className="mr-2">{source.name.toUpperCase()}</span>
          <ChevronRight className="h-4 w-4" />
        </a>
      </Button>
    ))}
  </div>
);

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentResponse, setCurrentResponse] = useState<ChatResponse | null>(
    null
  );

  const handleQuestionSelect = async (question: string) => {
    setInput(question);
    await handleSubmit(null, question);
  };

  const fetchChatResponse = async (
    messages: Message[]
  ): Promise<ChatResponse> => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return JSON.parse(data.content.text);
  };

  const handleSubmit = async (
    e: React.FormEvent | null,
    selectedQuestion?: string
  ) => {
    e?.preventDefault();
    const messageContent = selectedQuestion || input.trim();

    if (!messageContent) return;

    setError(null);
    setIsLoading(true);

    const userMessage: Message = {
      role: "user",
      content: messageContent,
    };

    try {
      setMessages((prev) => [...prev, userMessage]);
      const response = await fetchChatResponse([...messages, userMessage]);
      setCurrentResponse(response);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "An error occurred while fetching the response"
      );
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <form onSubmit={handleSubmit} className="relative">
        <Input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="How do we help you find your self?"
          disabled={isLoading}
          className="w-full pr-12 h-14 rounded-[12px] border-gray-200 text-lg"
        />
        <Button
          type="submit"
          disabled={isLoading}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[12px] w-10 h-10 p-0 bg-[#2B3147] hover:bg-[#1e2231]"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </form>

      {error && (
        <Card className="bg-red-50 border-none">
          <CardContent className="pt-6 text-red-600">{error}</CardContent>
        </Card>
      )}

      <QuestionCarousel
        questions={currentResponse?.followUpQuestions || INITIAL_QUESTIONS}
        onSelect={handleQuestionSelect}
        disabled={isLoading}
      />

      {currentResponse && (
        <div className="space-y-4">
          <p className="text-gray-700 text-lg leading-relaxed">
            {currentResponse.answer}
          </p>
          <SourcesList sources={currentResponse.sources} />
        </div>
      )}
    </div>
  );
}

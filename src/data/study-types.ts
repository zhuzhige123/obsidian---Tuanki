// Study session related types
import { Rating } from "./types";

// Study session data
export interface StudySession {
  id: string;
  deckId: string;
  startTime: Date;
  endTime?: Date;
  cardsReviewed: number;
  newCardsLearned: number;         // 🔑 本次会话学习的新卡片数量
  correctAnswers: number;
  totalTime: number;
  cardReviews: CardReview[];
}

// Individual card review in a session
export interface CardReview {
  cardId: string;
  rating: Rating;
  responseTime: number;
  timestamp: Date;
}

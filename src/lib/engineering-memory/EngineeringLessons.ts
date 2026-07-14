/**
 * EngineeringLessons.ts — Sprint 6.2.4
 * Structured lessons extracted from engineering history.
 */
import { makeMemId } from "./MEMTypes";

export interface Lesson {
  id:          string;
  sprint:      string;
  objective:   string;
  lesson:      string;
  category:    "SUCCESS" | "FAILURE" | "PATTERN" | "IMPROVEMENT";
  components:  string[];
  createdAt:   number;
}

export class EngineeringLessons {
  private readonly _lessons: Lesson[] = [];

  record(input: Omit<Lesson, "id" | "createdAt">): Lesson {
    const lesson: Lesson = { ...input, id: makeMemId("lesson"), createdAt: Date.now() };
    this._lessons.push(lesson);
    return lesson;
  }

  all(): Lesson[] { return [...this._lessons]; }

  bySprint(sprint: string): Lesson[] { return this._lessons.filter(l => l.sprint === sprint); }

  byCategory(cat: Lesson["category"]): Lesson[] { return this._lessons.filter(l => l.category === cat); }

  topLessons(n = 5): Lesson[] { return this._lessons.slice(-n).reverse(); }
}
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 基準年(2025年)と現在の年から学年を計算する
 * 10期生は2025年に1年生
 * 9期生は2025年に2年生
 * 8期生は2025年に3年生
 */
export function convertGenerationToGrade(generation: number): string {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // 4月を年度の始まりとする
  const fiscalYear = currentMonth >= 4 ? currentYear : currentYear - 1;

  // 10期生の入学年を計算 (2025年度に1年生)
  const baseEntranceYearFor10th = 2025; 

  // 対象期生の入学年度を計算
  const entranceYear = baseEntranceYearFor10th - (10 - generation);

  const grade = fiscalYear - entranceYear + 1;

  if (grade >= 1 && grade <= 3) {
    return `${grade}年生`;
  } else {
    return `${generation}期生`;
  }
}

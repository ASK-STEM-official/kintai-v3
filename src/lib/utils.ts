import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 期生から現在の学年を計算します。
 * - 基準: 10期生は2025年4月に入学する (2025年度に1年生)
 * - 8期生は2023年度入学(3年生)、9期生は2024年度入学(2年生)、10期生は2025年度入学(1年生)
 * - 4月1日を年度の区切りとします。
 * @param generation 期生
 * @returns 'X年生' または 'X期生'
 */
export function convertGenerationToGrade(generation: number): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  // 日本の年度は4月に始まるため、1月-3月は前年度として扱う
  const currentFiscalYear = now.getMonth() >= 3 ? currentYear : currentYear - 1;

  // 10期生の入学年度を基準とする
  const entranceFiscalYearFor10thGen = 2025;
  
  // 対象の期生の入学年度を計算
  const entranceFiscalYear = entranceFiscalYearFor10thGen - (10 - generation);
  
  // 現在の学年を計算
  const grade = currentFiscalYear - entranceFiscalYear + 1;

  if (grade >= 1 && grade <= 3) {
    return `${grade}年生`;
  } else {
    // 範囲外（卒業生など）の場合は期生をそのまま表示
    return `${generation}期生`;
  }
}

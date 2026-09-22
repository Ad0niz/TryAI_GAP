/** Consultant rating validation — mirrors backend review_service.create_rating
 * (all three dimensions required, integer scores 1–5). */

export interface RatingInput {
  knowledge?: number | null;
  friendliness?: number | null;
  methodology?: number | null;
}

export function isValidScore(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function isRatingComplete(input: RatingInput): boolean {
  return (
    isValidScore(input.knowledge) &&
    isValidScore(input.friendliness) &&
    isValidScore(input.methodology)
  );
}

/** Average of the three dimensions, rounded to one decimal (null when incomplete). */
export function ratingAverage(input: RatingInput): number | null {
  if (!isRatingComplete(input)) return null;
  const sum = input.knowledge! + input.friendliness! + input.methodology!;
  return Math.round((sum / 3) * 10) / 10;
}

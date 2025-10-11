import {
  validateRequired,
  validateMaxLength,
  validateDate,
} from "../core/validators/index.js";
import { ValidationError } from "../core/errors/AppError.js";

/**
 * Validate create collection data
 */
export function validateCreateCollection(data) {
  validateRequired(data, ["title"]);

  const title = validateMaxLength(data.title, 255, "title");

  const startsAt = data.startsAt ? validateDate(data.startsAt, "startsAt") : null;
  const endsAt = data.endsAt ? validateDate(data.endsAt, "endsAt") : null;

  if (startsAt && endsAt && startsAt >= endsAt) {
    throw new ValidationError("startsAt must be before endsAt");
  }

  const notes = data.notes ? validateMaxLength(data.notes, 500, "notes") : null;

  return {
    title,
    startsAt,
    endsAt,
    notes,
  };
}

/**
 * Validate update collection data
 */
export function validateUpdateCollection(data) {
  const updates = {};

  if (data.title !== undefined) {
    updates.title = validateMaxLength(data.title, 255, "title");
  }

  if (data.startsAt !== undefined) {
    updates.startsAt = data.startsAt
      ? validateDate(data.startsAt, "startsAt")
      : null;
  }

  if (data.endsAt !== undefined) {
    updates.endsAt = data.endsAt ? validateDate(data.endsAt, "endsAt") : null;
  }

  if (updates.startsAt && updates.endsAt && updates.startsAt >= updates.endsAt) {
    throw new ValidationError("startsAt must be before endsAt");
  }

  if (data.notes !== undefined) {
    updates.notes = data.notes
      ? validateMaxLength(data.notes, 500, "notes")
      : null;
  }

  if (Object.keys(updates).length === 0) {
    throw new ValidationError("No updates provided");
  }

  return updates;
}


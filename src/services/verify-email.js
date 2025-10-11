import { ValidationError } from "../core/errors/AppError.js";

export async function clearVerificationState(prisma, user) {
  if (!prisma || !user?.id) {
    throw new ValidationError(
      "clearVerificationState requires prisma instance and user",
      "INVALID_ARGUMENTS"
    );
  }

  const data = {
    emailVerificationTokenHash: null,
    emailVerificationExpiresAt: null,
  };

  if (!user.emailVerifiedAt) {
    data.emailVerifiedAt = new Date();
  }

  return prisma.user.update({
    where: { id: user.id },
    data,
  });
}

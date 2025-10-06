export async function clearVerificationState(prisma, user) {
  if (!prisma || !user?.id) {
    throw new Error("clearVerificationState requires prisma instance and user");
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

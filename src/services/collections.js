export async function getActiveCollections(client) {
  return client.collection.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
}

export async function resolveCollectionSelection({ collectionId, activeCollections, res, requireExplicit = false }) {
  const prisma = res?.app?.locals?.prisma;
  const list = activeCollections ?? (await getActiveCollections(prisma));
  if (!list?.length) {
    res?.status(400).json({ error: "NO_ACTIVE_COLLECTION" });
    return null;
  }
  if (collectionId !== undefined && collectionId !== null) {
    const col = list.find((c) => c.id === Number(collectionId));
    if (!col) {
      res?.status(404).json({ error: "COLLECTION_NOT_FOUND" });
      return null;
    }
    return col;
  }
  if (requireExplicit && list.length > 1) {
    res?.status(400).json({ error: "COLLECTION_SELECTION_REQUIRED" });
    return null;
  }
  return list[0];
}

export async function getActiveCollectionOr400(_req, res, options = {}) {
  const { collectionId, requireExplicit = false, activeCollections } = options;
  return resolveCollectionSelection({
    collectionId: collectionId !== undefined ? Number(collectionId) : undefined,
    activeCollections,
    res,
    requireExplicit,
  });
}

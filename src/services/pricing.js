export async function resolvePricingStep(productId, collectionId, client) {
  const db = client;
  const product = await db.product.findUnique({
    where: { id: Number(productId) },
  });
  if (!product || !product.isActive) return null;
  const cp = await db.collectionProduct.findUnique({
    where: {
      collectionId_productId: {
        collectionId: Number(collectionId),
        productId: Number(productId),
      },
    },
  });
  if (cp && !cp.isActive) return null;
  const step = cp?.stepOverrideDecimal ?? product.stepDecimal;
  const price = cp?.priceOverrideKopecks ?? product.priceKopecks;
  return { product, step, price, override: cp };
}

export function makeOrderNumber(id) {
  return `ORD-${String(id).padStart(5, "0")}`;
}

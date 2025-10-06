import { dec } from "../utils/decimal.js";

export async function getAnalyticsData(prisma, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const totalOrders = await prisma.order.count({
    where: { createdAt: { gte: startDate } },
  });

  const prevStartDate = new Date();
  prevStartDate.setDate(prevStartDate.getDate() - days * 2);
  const prevTotalOrders = await prisma.order.count({
    where: { createdAt: { gte: prevStartDate, lt: startDate } },
  });

  const revenueResult = await prisma.order.aggregate({
    where: { createdAt: { gte: startDate } },
    _sum: { totalKopecks: true },
  });
  const totalRevenue = revenueResult._sum.totalKopecks || 0;

  const prevRevenueResult = await prisma.order.aggregate({
    where: { createdAt: { gte: prevStartDate, lt: startDate } },
    _sum: { totalKopecks: true },
  });
  const prevTotalRevenue = prevRevenueResult._sum.totalKopecks || 0;

  const totalCustomers = await prisma.user.count({
    where: { createdAt: { gte: startDate }, role: "CUSTOMER" },
  });
  const prevTotalCustomers = await prisma.user.count({
    where: {
      createdAt: { gte: prevStartDate, lt: startDate },
      role: "CUSTOMER",
    },
  });

  const avgOrderValue =
    totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const prevAvgOrderValue =
    prevTotalOrders > 0 ? Math.round(prevTotalRevenue / prevTotalOrders) : 0;

  const ordersByStatus = await prisma.order.groupBy({
    by: ["status"],
    where: { createdAt: { gte: startDate } },
    _count: { status: true },
  });
  const statusMap = {};
  ordersByStatus.forEach((item) => {
    statusMap[item.status] = item._count.status;
  });

  let topProductsRaw = [];
  try {
    topProductsRaw = await prisma.$queryRawUnsafe(
      `
        SELECT oi."productId" as productId,
               COUNT(oi.id) as orderCount,
               SUM(oi."subtotalKopecks") as revenue
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."createdAt" >= ?
        GROUP BY oi."productId"
        ORDER BY orderCount DESC
        LIMIT 10
      `,
      startDate
    );
  } catch (error) {
    console.warn("[analytics] Error fetching top products:", error);
    topProductsRaw = [];
  }
  const topProductsWithDetails = await Promise.all(
    (topProductsRaw || []).map(async (row) => {
      const product = await prisma.product.findUnique({
        where: { id: Number(row.productId) },
        select: { id: true, title: true, imagePath: true, unitLabel: true },
      });
      return {
        ...product,
        orderCount: Number(row.orderCount) || 0,
        revenue: Number(row.revenue) || 0,
      };
    })
  );

  let dailyOrders = [];
  try {
    dailyOrders = await prisma.$queryRawUnsafe(
      `
        SELECT DATE("createdAt") as date,
               COUNT(*) as orders
        FROM "Order"
        WHERE "createdAt" >= ?
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
      startDate
    );
  } catch (error) {
    console.warn("[analytics] Error fetching daily orders:", error);
    dailyOrders = [];
  }

  const categoryStats = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { order: { createdAt: { gte: startDate } } },
    _count: { productId: true },
    _sum: { subtotalKopecks: true },
  });
  const categoryMap = {};
  for (const item of categoryStats) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: { category: true },
    });
    const category = product?.category || "Без категории";
    if (!categoryMap[category])
      categoryMap[category] = { orderCount: 0, revenue: 0 };
    categoryMap[category].orderCount += item._count.productId;
    categoryMap[category].revenue += item._sum.subtotalKopecks || 0;
  }
  const categoryStatsArray = Object.entries(categoryMap).map(
    ([name, stats]) => ({ name, ...stats })
  );

  const lowStockProducts = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      title: true,
      imagePath: true,
      unitLabel: true,
      stockQuantity: true,
      minStock: true,
    },
  });
  const lowStockFiltered = lowStockProducts.filter((p) => {
    try {
      const stockQty = p.stockQuantity || "0";
      const minStock = p.minStock || "0";
      return dec(stockQty).lte(dec(minStock));
    } catch (error) {
      console.warn("Error processing stock for product", p.id, error);
      return false;
    }
  });

  return {
    totalOrders,
    totalRevenue,
    totalCustomers,
    avgOrderValue,
    ordersChange:
      prevTotalOrders > 0
        ? Math.round(((totalOrders - prevTotalOrders) / prevTotalOrders) * 100)
        : 0,
    revenueChange:
      prevTotalRevenue > 0
        ? Math.round(
            ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100
          )
        : 0,
    customersChange:
      prevTotalCustomers > 0
        ? Math.round(
            ((totalCustomers - prevTotalCustomers) / prevTotalCustomers) * 100
          )
        : 0,
    avgOrderChange:
      prevAvgOrderValue > 0
        ? Math.round(
            ((avgOrderValue - prevAvgOrderValue) / prevAvgOrderValue) * 100
          )
        : 0,
    ordersByStatus: statusMap,
    topProducts: topProductsWithDetails,
    dailyOrders,
    categoryStats: categoryStatsArray,
    lowStockProducts: lowStockFiltered,
  };
}

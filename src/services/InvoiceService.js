import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";

export class InvoiceService {
  constructor() {
    this.tempDir = path.join(process.cwd(), "temp");
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create temp directory:", error);
    }
  }

  /**
   * Generate PDF invoice for order
   */
  async generateInvoicePDF(order) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();

      // Generate HTML content
      const htmlContent = this.generateInvoiceHTML(order);

      await page.setContent(htmlContent, { waitUntil: "networkidle0" });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "20mm",
          right: "20mm",
          bottom: "20mm",
          left: "20mm",
        },
      });

      return pdfBuffer;
    } finally {
      await browser.close();
    }
  }

  /**
   * Generate HTML content for invoice
   */
  generateInvoiceHTML(order) {
    const formatPrice = (kopecks) => {
      return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        minimumFractionDigits: 0,
      }).format(kopecks / 100);
    };

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const user = order.user;
    const isGuest = order.isGuestOrder;

    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Фактура ${order.orderNumber}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            color: #333;
            line-height: 1.4;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #007bff;
            padding-bottom: 20px;
        }
        .company-name {
            font-size: 24px;
            font-weight: bold;
            color: #007bff;
            margin-bottom: 5px;
        }
        .document-title {
            font-size: 18px;
            font-weight: bold;
            margin-top: 10px;
        }
        .order-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
        }
        .info-block {
            flex: 1;
            margin: 0 10px;
        }
        .info-block h3 {
            margin: 0 0 10px 0;
            color: #007bff;
            font-size: 16px;
        }
        .info-item {
            margin-bottom: 5px;
        }
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        .items-table th,
        .items-table td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        .items-table th {
            background-color: #f8f9fa;
            font-weight: bold;
        }
        .total-section {
            text-align: right;
            margin-top: 20px;
        }
        .total-amount {
            font-size: 18px;
            font-weight: bold;
            color: #007bff;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="company-name">Ля Креведко</div>
        <div class="document-title">Фактура № ${order.orderNumber}</div>
    </div>

    <div class="order-info">
        <div class="info-block">
            <h3>Информация о заказе</h3>
            <div class="info-item"><strong>Номер заказа:</strong> ${order.orderNumber}</div>
            <div class="info-item"><strong>Дата заказа:</strong> ${formatDate(order.createdAt)}</div>
            <div class="info-item"><strong>Статус:</strong> ${order.status}</div>
            ${order.collection ? `<div class="info-item"><strong>Период:</strong> ${order.collection.title}</div>` : ""}
        </div>
        
        <div class="info-block">
            <h3>${isGuest ? "Контактная информация" : "Информация о клиенте"}</h3>
            ${
              isGuest
                ? `
                ${order.guestName ? `<div class="info-item"><strong>Имя:</strong> ${order.guestName}</div>` : ""}
                ${order.guestPhone ? `<div class="info-item"><strong>Телефон:</strong> ${order.guestPhone}</div>` : ""}
                ${order.guestEmail ? `<div class="info-item"><strong>Email:</strong> ${order.guestEmail}</div>` : ""}
                ${order.guestContactInfo ? `<div class="info-item"><strong>Доп. контакты:</strong> ${order.guestContactInfo}</div>` : ""}
            `
                : `
                ${
                  user
                    ? `
                    <div class="info-item"><strong>Имя:</strong> ${[user.firstName, user.lastName].filter(Boolean).join(" ") || "Не указано"}</div>
                    ${user.email ? `<div class="info-item"><strong>Email:</strong> ${user.email}</div>` : ""}
                    ${user.phone ? `<div class="info-item"><strong>Телефон:</strong> ${user.phone}</div>` : ""}
                `
                    : ""
                }
            `
            }
        </div>
        
        <div class="info-block">
            <h3>Доставка</h3>
            <div class="info-item"><strong>Способ:</strong> ${order.deliveryType === "DELIVERY" ? "Доставка" : "Самовывоз"}</div>
            ${order.deliveryAddress ? `<div class="info-item"><strong>Адрес:</strong> ${order.deliveryAddress}</div>` : ""}
            ${order.deliveryCost > 0 ? `<div class="info-item"><strong>Стоимость доставки:</strong> ${formatPrice(order.deliveryCost * 100)}</div>` : ""}
        </div>
    </div>

    <table class="items-table">
        <thead>
            <tr>
                <th>№</th>
                <th>Товар</th>
                <th>Количество</th>
                <th>Цена за единицу</th>
                <th>Сумма</th>
            </tr>
        </thead>
        <tbody>
            ${(order.items || [])
              .map(
                (item, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${item.titleSnapshot || "Товар"}</td>
                    <td>${item.quantityDecimal || 0} ${item.unitLabelSnapshot || "шт"}</td>
                    <td>${formatPrice(item.unitPriceKopecks || 0)}</td>
                    <td>${formatPrice(item.subtotalKopecks || 0)}</td>
                </tr>
            `
              )
              .join("")}
        </tbody>
    </table>

    <div class="total-section">
        <div class="total-amount">
            ИТОГО: ${formatPrice(order.totalKopecks || 0)}
        </div>
    </div>

    <div class="footer">
        <p>Спасибо за ваш заказ!</p>
        <p>Мы свяжемся с вами для уточнения деталей и способа оплаты.</p>
        <p>Дата генерации: ${formatDate(new Date())}</p>
    </div>
</body>
</html>
    `;
  }
}

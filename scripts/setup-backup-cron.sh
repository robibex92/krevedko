#!/bin/bash

# Скрипт для настройки автоматического бэкапа через cron
# Бэкап будет выполняться каждые 12 часов (в 02:00 и 14:00)

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-database.sh"

echo "🔧 Настройка автоматического бэкапа базы данных..."
echo ""
echo "Бэкапы будут создаваться:"
echo "  - Каждые 12 часов (02:00 и 14:00)"
echo "  - Хранятся 30 дней"
echo "  - Директория: /var/backups/krevedko"
echo ""

# Сделать скрипт исполняемым
chmod +x "$BACKUP_SCRIPT"
chmod +x "$SCRIPT_DIR/restore-database.sh"

# Создать директорию для бэкапов
sudo mkdir -p /var/backups/krevedko
sudo chown $(whoami):$(whoami) /var/backups/krevedko

# Добавить задачу в cron
CRON_JOB="0 2,14 * * * $BACKUP_SCRIPT >> /var/log/krevedko-backup.log 2>&1"

# Проверить существующие задачи
if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
    echo "⚠️  Задача cron уже существует"
else
    # Добавить новую задачу
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "✅ Задача cron добавлена"
fi

echo ""
echo "📋 Текущие задачи cron для бэкапа:"
crontab -l | grep backup-database

echo ""
echo "✅ Настройка завершена!"
echo ""
echo "📝 Полезные команды:"
echo "  • Список бэкапов:     ls -lh /var/backups/krevedko/"
echo "  • Просмотр логов:     tail -f /var/log/krevedko-backup.log"
echo "  • Ручной бэкап:       $BACKUP_SCRIPT"
echo "  • Восстановление:     $SCRIPT_DIR/restore-database.sh <файл>"
echo "  • Редактировать cron: crontab -e"


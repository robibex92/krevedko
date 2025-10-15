#!/bin/bash

# Скрипт для восстановления базы данных из бэкапа
# Использование: ./restore-database.sh <путь_к_бэкапу>

if [ $# -eq 0 ]; then
    echo "❌ Ошибка: укажите путь к файлу бэкапа"
    echo "Использование: ./restore-database.sh <путь_к_бэкапу.sql.gz>"
    echo ""
    echo "Доступные бэкапы:"
    ls -lh /var/backups/krevedko/krevedko_backup_*.sql.gz 2>/dev/null || echo "Нет доступных бэкапов"
    exit 1
fi

BACKUP_FILE=$1

# Проверка существования файла
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Файл не найден: $BACKUP_FILE"
    exit 1
fi

# Загрузка переменных окружения
if [ -f ../.env ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
fi

echo "[$(date)] 🔄 Восстановление базы данных из: $BACKUP_FILE"
echo ""
echo "⚠️  ВНИМАНИЕ! Это действие перезапишет текущую базу данных!"
read -p "Продолжить? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Отменено."
    exit 0
fi

# Парсинг DATABASE_URL
DB_URL=$DATABASE_URL
DB_USER=$(echo $DB_URL | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DB_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DB_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DB_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DB_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

# Распаковать если это .gz файл
if [[ $BACKUP_FILE == *.gz ]]; then
    TEMP_FILE="/tmp/restore_temp.sql"
    echo "[$(date)] Распаковка бэкапа..."
    gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"
    RESTORE_FILE="$TEMP_FILE"
else
    RESTORE_FILE="$BACKUP_FILE"
fi

# Восстановление
export PGPASSWORD=$DB_PASS
echo "[$(date)] Восстановление базы данных..."

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres \
    -c "DROP DATABASE IF EXISTS $DB_NAME;"

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres \
    -c "CREATE DATABASE $DB_NAME;"

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
    -f "$RESTORE_FILE"

if [ $? -eq 0 ]; then
    echo "[$(date)] ✅ База данных успешно восстановлена!"
else
    echo "[$(date)] ❌ Ошибка при восстановлении базы данных!"
    exit 1
fi

# Удалить временный файл
if [ -f "$TEMP_FILE" ]; then
    rm "$TEMP_FILE"
fi

unset PGPASSWORD

echo ""
echo "✅ Восстановление завершено."
echo "💡 Не забудьте перезапустить приложение: pm2 restart krevedko"


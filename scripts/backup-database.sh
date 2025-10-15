#!/bin/bash

# Скрипт для автоматического бэкапа PostgreSQL базы данных
# Сохраняет полный дамп БД каждые 12 часов

# Загрузка переменных окружения
if [ -f ../.env ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
fi

# Директория для хранения бэкапов
BACKUP_DIR="/var/backups/krevedko"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="krevedko_backup_${TIMESTAMP}.sql"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# Создать директорию если не существует
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Начало создания бэкапа базы данных..."

# Извлечь параметры подключения из DATABASE_URL
# Формат: postgresql://user:password@host:port/database
DB_URL=$DATABASE_URL

# Парсинг DATABASE_URL
DB_USER=$(echo $DB_URL | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DB_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DB_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DB_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DB_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

# Создать бэкап
export PGPASSWORD=$DB_PASS
pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
    --clean \
    --if-exists \
    --create \
    --encoding=UTF8 \
    -f "$BACKUP_PATH"

if [ $? -eq 0 ]; then
    echo "[$(date)] ✅ Бэкап успешно создан: $BACKUP_PATH"
    
    # Сжать бэкап для экономии места
    gzip "$BACKUP_PATH"
    echo "[$(date)] ✅ Бэкап сжат: ${BACKUP_PATH}.gz"
    
    # Размер бэкапа
    BACKUP_SIZE=$(du -h "${BACKUP_PATH}.gz" | cut -f1)
    echo "[$(date)] 📦 Размер бэкапа: $BACKUP_SIZE"
    
    # Удалить бэкапы старше 30 дней
    find "$BACKUP_DIR" -name "krevedko_backup_*.sql.gz" -mtime +30 -delete
    echo "[$(date)] 🗑️  Удалены бэкапы старше 30 дней"
    
    # Количество бэкапов
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/krevedko_backup_*.sql.gz 2>/dev/null | wc -l)
    echo "[$(date)] 📊 Всего бэкапов: $BACKUP_COUNT"
else
    echo "[$(date)] ❌ Ошибка при создании бэкапа!"
    exit 1
fi

unset PGPASSWORD

echo "[$(date)] Бэкап завершен."


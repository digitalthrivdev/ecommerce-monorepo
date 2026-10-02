#!/bin/sh
# One database dump (pg_dump custom format), then deletes dumps older than BACKUP_KEEP_DAYS.
# Also copies new uploaded images into backups/uploads. Image files never change once written, so
# only new ones are copied, and none are deleted there.
# Run by the backup service; on demand: docker compose exec backup sh /usr/local/bin/backup.sh
# Restore (stop the api first: docker compose stop api admin):
#   docker compose cp backups/<file>.dump postgres:/tmp/restore.dump
#   docker compose exec postgres pg_restore -U grocery -d grocery --clean --if-exists /tmp/restore.dump
#   docker compose run --rm --no-deps --user root -v ./backups/uploads:/restore:ro api \
#     sh -c 'cp -Rpu /restore/. uploads/ && chown -R node:node uploads'
#   docker compose start api admin
set -eu

file="/backups/grocery-$(date -u +%Y%m%dT%H%M%SZ).dump"
if pg_dump --format=custom --file="$file.partial"; then
  mv "$file.partial" "$file"
  echo "Backup written: $file ($(du -h "$file" | cut -f1))"
else
  rm -f "$file.partial"
  echo "Backup FAILED" >&2
  exit 1
fi

find /backups -name 'grocery-*.dump' -type f -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete

if [ -d /uploads ]; then
  mkdir -p /backups/uploads
  cp -Rpu /uploads/. /backups/uploads/
  find /backups/uploads -name '*.tmp' -type f -delete
  echo "Images backed up: $(du -sh /backups/uploads | cut -f1)"
fi

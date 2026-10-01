# Zaxis KDP Server Jobs

## Scheduled backup

Configure a cPanel Cron Job to run periodically, for example every hour:

```
php /home/ACCOUNT/path-to-zaxis-kdp/apps/server/bin/run-backup.php
```

The script reads the Admin backup settings. It only creates a backup when the configured interval has elapsed, applies retention automatically, and can copy each backup to a secondary server path.

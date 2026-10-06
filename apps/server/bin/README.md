# Zaxis KDP Server Jobs

## Scheduled backup

Configure a cPanel Cron Job to run periodically, for example every hour:

```
php /home/ACCOUNT/path-to-zaxis-kdp/apps/server/bin/run-backup.php
```

The script reads the Admin backup settings. It only creates a backup when the configured interval has elapsed, applies retention automatically, and can copy each backup to a secondary server path.


## Disaster recovery

To restore a Zaxis KDP external backup ZIP into a clean/rebuilt server database:

```bash
php /home/ACCOUNT/path-to-zaxis-kdp/apps/server/bin/restore-backup.php /private/path/zaxis-kdp-backup.zip --yes
```

The command is CLI-only, requires an explicit `--yes` destructive-restore acknowledgement, registers the external archive in backup history, validates/restores it through `BackupService`, creates a safety backup first, restores asset binaries when present, clears stale project locks, and invalidates API tokens/pairing codes so Windows devices must reconnect.

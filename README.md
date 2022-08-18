# Hash Backup Tool

This program is used to create backups of a given folder tree by referencing each file by its hash. Each additional backup to the same backup dir will only add new files that have a different hash, so space is conserved. All file timestamps made available in node.js are preserved.

# Usage

Download `hash_backup.js` and place anywhere. Run `node hash_backup.js` to see help.

## Help

```
Node Hash Backup Tool

Usage: node hash_backup.js [command] [arguments]

Command `init`:
  Usage: node hash_backup.js init <backupDir>
  Initalizes empty hash backup in backup dir.

Command `delete`:
  Usage: node hash_backup.js delete <backupDir>
  Removes all files at hash backup dir.
```

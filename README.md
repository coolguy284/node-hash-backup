# Hash Backup Tool

This program is used to create backups of a given folder tree by referencing each file by its hash. Each additional backup to the same backup dir will only add new files that have a different hash, so space is conserved. All file timestamps made available in node.js are preserved.

# Usage

Download `hash_backup.js` and place anywhere. Run `node hash_backup.js` to see help.

## Help

```
Node Hash Backup Tool

Usage: node hash_backup.js [command] [arguments]

Command `init`:
  Usage: node hash_backup.js init [options]
  
  Initalizes empty hash backup in backup dir.
  
  Options:
    --to <backupDir> (default .): The backup dir to initialize.
    --hash <algorythm> (default sha384): The hash algorythm to use on the files.
    --hash-slice-length (default 2): The length of the hash slice used to split files into folders.
    --hash-slices (default 2): The number of nested subfolders of hash slices each file should be under.

Command `delete`:
  Usage: node hash_backup.js delete [options]
  
  Removes all files at hash backup dir.
  
  Options:
    --to <backupDir> (default .): The backup dir to remove contents of.
```

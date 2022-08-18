# Hash Backup Tool

This program is used to create backups of a given folder tree by referencing each file by its hash. Each additional backup to the same backup dir will only add new files that have a different hash, so space is conserved. All file and folder timestamps (made available in node.js) are preserved, and so are empty folders.

# Usage

Download `hash_backup.js` and place anywhere. Run `node hash_backup.js` to see available commands.

## Help

```
Node Hash Backup Tool

Usage: node hash_backup.js [command] [options]

Command `init`:
  Initalizes empty hash backup in backup dir.
  
  Options:
    --to <backupDir> (required): The hash backup dir to initialize.
    --hash <algorythm> (default `sha384`): The hash algorythm to use on the files.
    --hash-slice-length (default `2`): The length of the hash slice used to split files into folders.
    --hash-slices (default `2`): The number of nested subfolders of hash slices each file should be under.
    --compress-algo (default `brotli`): The algorythm to compress files (`none` for no algo).
    --compress-level (default 6): The amount to compress files (valid is 1 through 9).

Command `delete`:
  Removes all files at hash backup dir.
  
  Options:
    --to <backupDir> (required): The hash backup dir to remove contents of.

Command `backup`:
  Backs up a folder to the hash backup.
  
  Options:
    --from <path> (required): The directory to backup.
    --to <backupDir> (required): The hash backup folder to use.
    --name <name> (required): The name of the backup.
    --ignore-symlinks <value> (default false): If true, symlinks will be ignored. If false, symlinks will be copied over as regular files (and the modtime of the destination file will be used).
    --in-memory <value> (default true): Read file into memory and store hash and compressed forms into memory. Minimizes hard drive reads/writes. Turn off for files too large to fit in memory.

Command `restore`:
  Restores a folder from the hash backup.
  
  Options:
    --from <backupDir> (required): The hash backup folder to use.
    --to <path> (required): The directory to restore to.
    --name <name> (required): The name of the backup.
    --verify <value> (default true): If true, file checksums will be verified as they are copied out.
```

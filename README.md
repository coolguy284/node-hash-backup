# Hash Backup Tool

This program is used to create backups of a given folder tree by referencing each file by its hash. Each additional backup to the same backup dir will only add new files that have a different hash, so space is conserved. All file and folder timestamps (made available in node.js) are preserved (although only atime and mtime can be restored), and so are empty folders.

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
    --hash <algorithm> (default `sha384`): The hash algorithm to use on the files.
    --hash-slice-length (default `2`): The length of the hash slice used to split files into folders.
    --hash-slices (default `2`): The number of nested subfolders of hash slices each file should be under.
    --compress-algo (default `brotli`): The algorithm to compress files (`none` for no algo).
    --compress-level (default 6): The amount to compress files (valid is 1 through 9).

Command `delete`:
  Removes all files at hash backup dir.
  
  Options:
    --to <backupDir> (required): The hash backup dir to remove contents of.

Command `list`:
  Lists the backups in a given hash backup folder.
  
  Options:
    --to <backupDir> (required): The hash backup folder to use.
    --name <name> (optional): The name of the backup to show information about specifically.

Command `backup`:
  Backs up a folder to the hash backup.
  
  Options:
    --from <basePath> (required): The directory to backup.
    --to <backupDir> (required): The hash backup folder to use.
    --name <name> (required): The name of the backup.
    --ignore-symlinks <value> (default false): If true, symlinks will be ignored (not implemented yet). If false, symlinks will be copied over as regular files (and the modtime of the destination file will be used).
    --in-memory <value> (default true): Read file into memory and store hash and compressed forms into memory. Minimizes hard drive reads/writes. Turn off for files too large to fit in memory (not implemented yet).
    --check-duplicate-hashes (default true): If true, check for whether files are truly equal if their hashes are (false not implemented yet, true will error if hashes match as duplicate hash handling not implemented yet).

Command `restore`:
  Restores a folder from the hash backup.
  
  Options:
    --from <backupDir> (required): The hash backup folder to use.
    --to <basePath> (required): The directory to restore to.
    --name <name> (required): The name of the backup.
    --verify <value> (default true): If true, file checksums will be verified as they are copied out.

Command `remove`:
  Removes a backup from the hash backup.
  
  Options:
    --to <backupDir> (required): The hash backup folder to use.
    --name <name> (required): The name of the backup.
    --auto-purge (default true): If true, automatically purge files no longer referenced by any backup. (false not implemented yet)
```

## Warning
Restoration of symbolic link timestamps is inaccurate, and the birthtime cannot be set.

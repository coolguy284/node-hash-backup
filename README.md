# Hash Backup Tool

This program is used to create backups of a given folder tree by referencing each file by its hash. Each additional backup to the same backup dir will only add new files that have a different hash, so space is conserved. All file and folder timestamps (that are made available to node.js) are preserved (although only atime, mtime, and birthtime (Windows only) can be restored), and so are empty folders.

# Usage

Download this repository as a zip file and place anywhere. Run `node <path to extracted folder>` to see available commands. Run `node <path to extracted folder> <command parameters>` to run a command.

## What does node-hash-backup store?

There are 3 types of files that node-hash-backup keeps track of: files, folders, and symbolic links.

Information tracked on files, folders, and symbolic links:
- access time (to nanosecond precision, limited by operating system)
- modification time (to nanosecond precision, limited by operating system)
- change time (only stored, cannot be set; to nanosecond precision, limited by operating system)
- creation time (cannot be set on linux; to nanosecond precision, limited by operating system)
- readonly attribute (set or unset)

Information tracked on files:
- precise bytes of content

Information tracked on symbolic link:
- exact bytes of symlink target
- symlink type (on Windows; file symlink, directory symlink, or directory junction)

## Help

```
NodeJS Hash Backup Tool v2.3.0
LZMA Support: Installed
Native FS Library: Not Installed

Usage: node <path to folder of hash backup code> [command] [options]
  Command is optional. Options can be specified in either the format "--argument=value" or
  "--argument value" (with the space in between meaning there are two separate command line
  arguments, i.e. ["--argument", "value"]).

Warning:
  Restoration of symbolic link timestamps is inaccurate (for the last decimal place or two
  (or maybe more) on Windows's 7 decimal-digit precision timestamps), and the birthtime cannot
  be set.

Command `init`:
  Initalizes an empty hash backup in backup dir.
  
  Options:
    --backupDir=<backupDir> (required): The hash backup dir to initialize.
        aliases: --backup-dir, --to
    --hashAlgo=<algorithm> (default `sha256`): The hash algorithm to use on the files.
        aliases: --hash-algo, --hash
    --hashParams=<JSON object, i.e. '{"outputLength":32}'>: If necessary, provides parameters
    for the hash function (such as length of an extensible-output hashing function).
        aliases: --hash-params
    --hashOutputTrimLength=<integer >= 1>: If provided, trim hash hex output to the provided
    length in hex chars.
        aliases: --hash-output-trim-length
    --hashSlices=<integer >= 0> (default `1`): The number of nested subfolders of hash slices
    each file should be under.
        aliases: --hash-slices
    --hashSliceLength=<integer >= 0> (default `2`): The length of the hash slice used to split
    files into folders.
        aliases: --hash-slice-length
    --compressAlgo=<string> (default `brotli`): The algorithm to compress files (`none` for
    no compression).
        aliases: --compress-algo
    --compressParams=<JSON object, i.e. '{"level":9}'> (default `{}`): Parameters for the compressor.
        aliases: --compress-params
    --compressLevel=<integer> (default `6` if compression algorthm is `deflate-raw`, `deflate`,
    `gzip`, or `brotli`, and --compress-params is left at default (but not if explicitly set
    to "{}"); unspecified otherwise): The amount to compress files (valid is 1 through 9).
    Overwrites --compress-params's level parameter.
        aliases: --compress-level
    --treatWarningsAsErrors=<true|false> (default `false`): If true, warnings (about insecure
    hash or too small hash output trim) during hash backup dir creation will be treated as
    errors preventing backup dir creation.
        aliases: --treat-warnings-as-errors

Command `delete`:
  Removes all files in hash backup dir.
  
  Aliases:
    delete-all
  
  Options:
    --backupDir=<backupDir> (required): The hash backup dir to remove contents of.
        aliases: --backup-dir, --to
    --confirm=yes (required): Must be set to allow deletion.

Command `info`:
  Lists the backups in a given hash backup folder along with detailed information about them.
  
  Aliases:
    list
  
  Options:
    --backupDir=<backupDir> (required): The hash backup folder to get data from.
        aliases: --backup-dir, --from
    --name=<name> (optional): If present, only show information about one backup.

Command `backup`:
  Backs up a folder to the hash backup.
  
  Options:
    --pathToBackup=<basePath> (required): The directory to backup.
        aliases: --path-to-backup, --basePath, --base-path, --from
    --name=<name> (required): The name of the backup.
    --backupDir=<backupDir> (required): The hash backup folder to use.
        aliases: --backup-dir, --to
    --excludedItems=<excludedItems> (default "[]"): The relative paths to exclude from the
    backup dir.
        aliases: --excluded-items
    --allowBackupDirSubPathOfFileOrFolderPath (default false): If true, backup folder can be
    subpath of the folder you are taking a backup of.
        aliases: --allow-backup-dir-sub-path-of-file-or-folder-path
    --symlinkHandling=<value> (default "preserve"):
        aliases: --symlink-handling
        If "ignore", symlinks will be ignored.
        If "passthrough", symlinks will be copied over as regular files (and the modtime of
        the destination file will be used).
        If "preserve", symlinks will be added to the backup as-is, storing their path.
    --storeSymlinkType=<true|false> (default `true`): If true, on Windows, the type of a symbolic
    link will be stored (i.e. whether the symbolic link is a file or directory symbolic link
    or a directory junction).
        aliases: --store-symlink-type
    --inMemoryCutoff=<integer >= -1 | Infinity> (default `4_194_304`): Below the cutoff, read
    file into memory and calculate hash and compressed forms in memory, to minimize hard drive
    reads/writes.
        aliases: --in-memory-cutoff
    --compressionMinimumSizeThreshold (default -1): The file size must be greater than or equal
    to this for compression to activate.
        aliases: --compression-minimum-size-threshold
    --compressionMaximumSizeThreshold (default Infinity): The file size must be greater than
    or equal to this for compression to activate.
        aliases: --compression-maximum-size-threshold
    --checkDuplicateHashes (default true): If true, if a file's hash already exists in the
    backup dir, the file in the backup dir will be compared against the file to be added to
    be backup to see if they are not the same, in which case a hash collision occurred.
        aliases: --check-duplicate-hashes
    --ignoreErrors (default false): If true, errors when adding a file to the backup will be
    ignored and the file will not be added to the backup.
        aliases: --ignore-errors

Command `restore`:
  Restores a folder from the hash backup.
  
  Options:
    --backupDir=<backupDir> (required): The hash backup folder to use.
        aliases: --backup-dir, --from
    --name=<name> (required): The name of the backup.
    --restorePath=<basePath> (required): The directory to restore to.
        aliases: --restore-path, --basePath, --base-path, --to
    --pathToEntry=<relativePath> (default `.`): The path inside the backup of the file or folder
    to be restored.
        aliases: --path-to-entry
    --excludedItems=<excludedItems> (default "[]"): The relative paths to exclude from the
    backup dir.
        aliases: --excluded-items
    --symlinkHandling=<value> (default "preserve"):
        aliases: --symlink-handling
        If "ignore", symlinks in backup will not be copied.
        If "passthrough", symlinks will be created as regular files, copying in their contents
        (and the modtime of the destination file will be set).
        If "preserve", symlinks will be added to the backup as-is, including their path.
    --inMemoryCutoff=<integer >= -1 | Infinity> (default `4_194_304`): Below the cutoff, read
    file into memory and calculate hash and decompressed forms in memory, to minimize hard
    drive reads/writes.
        aliases: --in-memory-cutoff
    --setFileTimes=<boolean> (default true): If true, file access, modification, and creation
    times (creation time only on supported systems) will be set at end of restore.
        aliases: --set-file-times
    --lowAccuracyFileTimes=<boolean> (default false): If true, file timestamps will be restored
    using a quicker but less accurate method. WARNING: This method does not restore file creation
    times! The quicker method uses a nodejs function instead of a shell process creation, which
    is phenomenally quicker but causes precision loss after milliseconds generally due to double
    precision floating point loss of unix timestamp seconds in libuv.
        aliases: --low-accuracy-file-times
    --createParentFolders=<boolean> (default false): If true, the parent folders of the restore
    folder will be created.
        aliases: --create-parent-folders
    --overwriteExisting=<boolean> (default false): If true, overwrite the existing restore
    location with the restore contents.
        aliases: --overwrite-existing
    --preserveOutputFolder=<boolean> (default true): If true, output folder will not be deleted
    and re-created if it already exists and the backup contains a folder at the top-level.
    --verify=<value> (default true): If true, file checksums will be verified as files are
    copied out.

Command `deleteBackup`:
  Deletes a given backup from the backup dir.
  
  Aliases:
    delete-backup
  
  Options:
    --backupDir=<backupDir> (required): The hash backup folder to delete the backup from.
        aliases: --backup-dir, --to
    --name=<name> (required): The name of the backup to delete.
    --confirm=yes (required): Must be set to allow deletion.
    --pruneFilesAfter=<true|false> (default `true`): If true, prune unused files in the hash
    backup afterward.

Command `renameBackup`:
  Renames a given backup in the backup dir.
  
  Aliases:
    rename-backup, rename
  
  Options:
    --backupDir=<backupDir> (required): The hash backup folder to get information from.
        aliases: --backup-dir, --to
    --oldName=<name> (required): The current name of the backup.
    --newName=<name> (required): The new name of the backup.

Command `getFolderContents`:
  Gets a listing of the files/folders in a given folder of the backup.
  
  Aliases:
    get-folder-contents
  
  Options:
    --backupDir=<backupDir> (required): The hash backup folder to get information from.
        aliases: --backup-dir, --from
    --name=<name> (required): The name of the backup to get the file from.
    --pathToFolder=<relativePath> (required): The path inside the backup of the folder to get
    the contents of.
        aliases: path-to-folder

Command `getEntryInfo`:
  Gets detailed information about an entry of the backup.
  
  Aliases:
    get-entry-info
  
  Options:
    --backupDir=<backupDir> (required): The hash backup folder to get information from.
        aliases: --backup-dir, --from
    --name=<name> (required): The name of the backup to get the file from.
    --pathToEntry=<relativePath> (required): The path inside the backup of the item to get
    information from.
        aliases: path-to-entry

Command `getSubtree`:
  Gets a listing of the files in a given subtree of the backup.
  
  Aliases:
    get-subtree
  
  Options:
    --backupDir=<backupDir> (required): The hash backup folder to get information from.
        aliases: --backup-dir, --from
    --name=<name> (required): The name of the backup to get the file from.
    --pathToEntry=<relativePath> (default `.`): The path inside the backup of the file or folder
    to get information from.
        aliases: path-to-entry
    --withEntries=<true|false> (default `false`): If false, a tree of files in backup will
    be shown. If true, a tree will not be shown and instead detailed information about each
    entry in the backup will be shown.
    --treeIndent=<integer >= 1> (default `2`): If tree mode is active, the number of spaces
    to the right to indent each level of the tree.

Command `getRawFileContents`:
  Directly prints the contents of a file to console.
  
  Aliases:
    get-raw-file-contents
  
  Options:
    --backupDir=<backupDir> (required): The hash backup folder to prune.
        aliases: --backup-dir, --to
    --name=<name> (required): The name of the backup to get the file from.
    --pathToFile=<relativePath> (required): The path inside the backup of the file to access.
        aliases: path-to-file
    --verify=<value> (default true): If true, file checksum will be verified before the file
    is output.

Command `pruneBackupDir`:
  Removes unreferenced files from the backup dir.
  
  Aliases:
    prune-backup-dir
  
  Options:
    --backupDir=<backupDir> (required): The hash backup folder to prune.
        aliases: --backup-dir, --to

Command `interactive`:
  Opens an interactive NodeJS REPL with all exported hash backup functions in the global scope.
  If a hash backup location is provided, a "hb" variable will be set to a BackupManager initialized
  to the backup dir. If the custom parameter is set, a variable called "data" will be set to
  the value of the custom parameter.
  
  Options:
    --backupDir=<backupDir>: The hash backup folder to open as a BackupManager object bound
    to the variable "hb".
        aliases: --backup-dir, --to
    --customData=<anything>: Custom data to pass to the NodeJS REPL.
        aliases: --custom-data, --custom
    --stringToEval=<anything>: A string to evaluate (as the body of an async function) before
    starting the NodeJS REPL.

Command `getKnownHashCompress`:
  Prints the known hash algorithms and compress algorithms.
  
  Aliases:
    get-known-hash-compress
  
  Options:
    --showHashes=<true|false> (default `true`): If true, will show supported hash algorithms.
        aliases: --show-hashes
    --showCompressionAlgos=<true|false> (default `true`): If true, will show supported compression
    algorithms.
        aliases: --show-compression-algos

Command `verifyBackupDir`:
  Fully checks all aspects of a given hash backup dir.
  
  Aliases:
    verify-backup-dir, verify
  
  Options:
    --backupDir=<backupDir> (required): The hash backup folder to check.
        aliases: --backup-dir, --to

Command `help`:
  Prints this help message.
  
  Subcommand <commandName>:
    If specified, only show help for the particular subcommand. Use special value "none" to
    show help for the main "No command" section.
  
  No subcommand:
    Options:
      --command=<commandName>: If specified, only show help for the particular subcommand.
      Use special value "none" to show help for the main "No command" section.

Command `version`:
  Prints the version of the hash backup program.

No command:
  Options:
    --help (mutually exclusive with --version): Prints this help message.
    --version (mutually exclusive with --help): Prints the version of the hash backup program.
    No option passed: Prints this help message.
```

## Warning
If the native helper library is not installed (hash-backup-native-fs in dependencies), restoration of symbolic link timestamps is inaccurate (for the last decimal place or two (or maybe more) on Windows's 7 decimal-digit precision timestamps), and the birthtime cannot be set.

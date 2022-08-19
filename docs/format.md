# Backup format

```
backup  .   .   .   .   . the backup directory
  backups   .   .   .   . folder with each "incremental" backup
    <backup_name>.json:
      object {
        createdAt: string (ISO date of backup creation),
        entries: array [
          object {
            path: string (relative path inside the backup folder),
            type: string (either "file" or "directory"),
            hash: string (file hash, property only present on files),
            atime: string (access time since unix epoch in seconds as a decimal, with 9 digits decimal precision),
            mtime: string (content modify time since unix epoch in seconds as a decimal, with 9 digits decimal precision),
            ctime: string (metadata change time since unix epoch in seconds as a decimal, with 9 digits decimal precision),
            birthtime: string (creation time since unix epoch in seconds as a decimal, with 9 digits decimal precision),
          },
          ...
        ],
      }
  files .   .   .   .   . folder with the actual files
    <segment1>/<segment2>/.../<hash of file contents>: the location that each file is stored in
  files_meta    .   .   . folder with file metadata
    <segment1>/.../<segmentX>.json:
      object {
        <hash of file contents>: object {
          compression: object? (can be null for no compression) {
            algorithm: string,
            ... (optional params necessary to decompress, depends on the compression algorithm)
          }
        }
      }
  info.json .   .   .   . main hash backup info file
    object {
      folderType: string ("coolguy284/node-hash-backup"),
      version: integer > 0 (1),
      hash: string (the hash algorithm used on the files),
      hashSliceLength: integer > 0 (the length of the hash slice to form segements of the folders in files),
      hashSlices: integer >= 0 (the number of segments of the folders in files),
      compression: object? (can be null for no compression) {
        algorithm: string,
        ... (optional params necessary to compress, depends on the compression algorithm, most likely property is level)
      }
    }
```

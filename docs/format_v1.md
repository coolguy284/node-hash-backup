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
            hash?: string (file hash, property only present on files),
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
    if number of slices is 0:
      meta.json:
        FILE_META_CONTENT
    else:
      <segment1>/.../<segmentX>.json:
        FILE_META_CONTENT
  info.json .   .   .   . main hash backup info file
    object {
      folderType: string ("coolguy284/node-hash-backup"),
      version: integer > 0 (1),
      hash: string (the hash algorithm used on the files),
      hashSliceLength: integer > 0 (the length of the hash slice to form segements of the folders in files),
      hashSlices: integer >= 0 (the number of segments of the folders in files),
      compression: object? (property null if no compression) {
        algorithm: string,
        ... (optional params necessary to compress, depends on the compression algorithm, most likely property is level)
      }
    }

FILE_META_CONTENT:
  object {
    <hash of file contents>: object {
      size: integer (file size in bytes),
      compressedSize?: integer (compressed file size in bytes, property only exists if there is compression),
      compression: object? (property null if no compression) {
        algorithm: string,
        ... (optional params necessary to decompress, depends on the compression algorithm)
      }
    }
  }
```

# Backup format

```
backup  .   .   .   .   . the backup directory
  backups   .   .   .   . folder with each "incremental" backup
    <backup_name>.json [read only (optional)]:
      object {
        createdAt: string (ISO date of backup creation),
        entries: array [
          object {
            path: string (relative path inside the backup folder, '.' for root folder (/ file), and path string for other folders / files; path string uses '/' as separator always; no leading '/' and no trailing '/' for any path),
            type: string (either "file", "directory", or "symbolic link"),
            attributes?: string[] (allowed length is 0 or 1, only allowed value is 'readonly'),
            hash?: string (file hash, property only present on files),
            symlinkType?: string (either "file", "directory", or "junction"; not present if unknown or on linux),
            symlinkPath?: string (base64 encoded; only present on symbolic links),
            atime: string (access time since unix epoch in seconds as a decimal, with 9 digits decimal precision),
            mtime: string (content modify time since unix epoch in seconds as a decimal, with 9 digits decimal precision),
            ctime: string (metadata change time since unix epoch in seconds as a decimal, with 9 digits decimal precision),
            birthtime: string (creation time since unix epoch in seconds as a decimal, with 9 digits decimal precision),
          },
          ...
        ],
      }
  files .   .   .   .   . folder with the actual files
    <segment1>/<segment2>/.../<hash of file contents> [read only (optional)]: the location that each file is stored in
  files_meta    .   .   . folder with file metadata
    if number of slices is 0:
      meta.json:
        FILE_META_CONTENT
    else:
      <segment1>/.../<segmentX>.json:
        FILE_META_CONTENT
  info.json .   .   .   . main hash backup info file [read only (optional)]
    object {
      folderType: string ("coolguy284/node-hash-backup"),
      version: integer > 0 (2),
      hash: string (the hash algorithm used on the files; default "sha256"),
      hashSlices: integer >= 0 (the number of segments of the folders in files; default 1),
      hashSliceLength?: integer > 0 | null (if and only if hashSlices == 0; required) (the length of the hash slice to form segements of the folders in files; default 2),
      compression?: object (property only exists if there is compression) {
        algorithm: string,
        ... (optional params necessary to compress, depends on the compression algorithm, most likely property is "level")
      }; default { algorithm: "brotli", level: 6 }
    }
  edit.lock?    .   .   . lock file to prevent more than one BackupManager from accessing the same folder

FILE_META_CONTENT:
  object {
    <hash of file contents>: object {
      size: integer (file size in bytes),
      compressedSize?: integer (compressed file size in bytes, property only exists if there is compression),
      compression?: object (property only exists if there is compression) {
        algorithm: string,
        ... (optional params necessary to decompress, depends on the compression algorithm)
      }
    }
  }
```

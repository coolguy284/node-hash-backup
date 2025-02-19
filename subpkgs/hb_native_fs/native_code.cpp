#include "native_code.hpp"
#include <sstream>

std::string getWindowsErrorMessage() {
  std::stringstream errorMessage;
  
  DWORD errorCode = GetLastError();
  
  errorMessage << "error code " << errorCode;
  
  LPVOID resultBuf;
  
  DWORD outputLength = FormatMessageA(
    FORMAT_MESSAGE_FROM_SYSTEM |
      FORMAT_MESSAGE_ALLOCATE_BUFFER |
      FORMAT_MESSAGE_IGNORE_INSERTS,
    nullptr,
    errorCode,
    0,
    (LPSTR) &resultBuf,
    0,
    nullptr
  );
  
  if (outputLength == 0) {
    errorMessage << "; description inaccessible (resulted in error code " << GetLastError() << ")";
  } else {
    std::string resultString = std::string((LPSTR) resultBuf, outputLength);
    LocalFree(resultBuf);
    errorMessage << "; description: " << resultString;
  }
  
  return errorMessage.str();
}

class WindowsHandleCloser {
  private:
    HANDLE handle;
  
  public:
    WindowsHandleCloser(HANDLE handleGiven): handle(handleGiven)
    {}
    
    ~WindowsHandleCloser() {
      // error ignored
      CloseHandle(handle);
    }
};

FILETIME uLongLongIntToFileTime(ULONGLONG fileTimeInt) {
  ULARGE_INTEGER filetimeConverter;
  filetimeConverter.QuadPart = fileTimeInt;
  
  FILETIME result;
  result.dwHighDateTime = filetimeConverter.HighPart;
  result.dwLowDateTime = filetimeConverter.LowPart;
  
  return result;
}

bool getItemMeta(std::wstring itemPath, ItemMeta* itemMeta, std::string* errorMessage) {
  DWORD itemMetaResult = GetFileAttributesW(itemPath.c_str());
  
  if (itemMetaResult == INVALID_FILE_ATTRIBUTES) {
    *errorMessage = std::string("error getting item attributes: ") + getWindowsErrorMessage();
    return false;
  }
  
  itemMeta->readonly = itemMetaResult & FILE_ATTRIBUTE_READONLY;
  itemMeta->hidden = itemMetaResult & FILE_ATTRIBUTE_HIDDEN;
  itemMeta->system = itemMetaResult & FILE_ATTRIBUTE_SYSTEM;
  itemMeta->archive = itemMetaResult & FILE_ATTRIBUTE_ARCHIVE;
  itemMeta->compressed = itemMetaResult & FILE_ATTRIBUTE_COMPRESSED;
  
  return true;
}

constexpr DWORD IGNORE_TIMESTAMP_WORD = 0xffffffff;

bool setItemMeta(std::wstring itemPath, ItemMetaSet itemMeta, std::string* errorMessage) {
  FILETIME accessTime;
  FILETIME modifyTime;
  FILETIME createTime;
  
  if (itemMeta.accessTime.has_value()) {
    accessTime = uLongLongIntToFileTime(itemMeta.accessTime.value());
  } else {
    accessTime.dwHighDateTime = IGNORE_TIMESTAMP_WORD;
    accessTime.dwLowDateTime = IGNORE_TIMESTAMP_WORD;
  }
  
  if (itemMeta.modifyTime.has_value()) {
    modifyTime = uLongLongIntToFileTime(itemMeta.modifyTime.value());
  } else {
    modifyTime.dwHighDateTime = IGNORE_TIMESTAMP_WORD;
    modifyTime.dwLowDateTime = IGNORE_TIMESTAMP_WORD;
  }
  
  if (itemMeta.createTime.has_value()) {
    createTime = uLongLongIntToFileTime(itemMeta.createTime.value());
  } else {
    createTime.dwHighDateTime = IGNORE_TIMESTAMP_WORD;
    createTime.dwLowDateTime = IGNORE_TIMESTAMP_WORD;
  }
  
  DWORD itemMetaResult = GetFileAttributesW(itemPath.c_str());
  
  if (itemMetaResult == INVALID_FILE_ATTRIBUTES) {
    *errorMessage = std::string("error getting item attributes: ") + getWindowsErrorMessage();
    return false;
  }
  
  if (itemMeta.readonly.has_value()) {
    itemMetaResult &= ~FILE_ATTRIBUTE_READONLY;
    if (itemMeta.readonly.value()) {
      itemMetaResult |= FILE_ATTRIBUTE_READONLY;
    }
  }
  
  if (itemMeta.hidden.has_value()) {
    itemMetaResult &= ~FILE_ATTRIBUTE_HIDDEN;
    if (itemMeta.hidden.value()) {
      itemMetaResult |= FILE_ATTRIBUTE_HIDDEN;
    }
  }
  
  if (itemMeta.system.has_value()) {
    itemMetaResult &= ~FILE_ATTRIBUTE_SYSTEM;
    if (itemMeta.system.value()) {
      itemMetaResult |= FILE_ATTRIBUTE_SYSTEM;
    }
  }
  
  if (itemMeta.archive.has_value()) {
    itemMetaResult &= ~FILE_ATTRIBUTE_ARCHIVE;
    if (itemMeta.archive.value()) {
      itemMetaResult |= FILE_ATTRIBUTE_ARCHIVE;
    }
  }
  
  if (itemMeta.compressed.has_value()) {
    itemMetaResult &= ~FILE_ATTRIBUTE_COMPRESSED;
    if (itemMeta.compressed.value()) {
      itemMetaResult |= FILE_ATTRIBUTE_COMPRESSED;
    }
  }
  
  if (!SetFileAttributesW(itemPath.c_str(), itemMetaResult)) {
    *errorMessage = std::string("error setting item attributes: ") + getWindowsErrorMessage();
    return false;
  }
  
  if (itemMeta.accessTime.has_value() || itemMeta.modifyTime.has_value() || itemMeta.createTime.has_value()) {
    HANDLE fileHandle = CreateFileW(
      itemPath.c_str(),
      0,
      FILE_SHARE_DELETE |
        FILE_SHARE_READ |
        FILE_SHARE_WRITE,
      nullptr,
      OPEN_EXISTING,
      FILE_FLAG_BACKUP_SEMANTICS |
        FILE_FLAG_OPEN_REPARSE_POINT |
        FILE_FLAG_POSIX_SEMANTICS,
      nullptr
    );
    
    if (fileHandle == INVALID_HANDLE_VALUE) {
      *errorMessage = std::string("error opening file to set timestamps: ") + getWindowsErrorMessage();
      return false;
    }
    
    WindowsHandleCloser fileHandleCloser = WindowsHandleCloser(fileHandle);
    
    if (!SetFileTime(
      fileHandle,
      &createTime,
      &accessTime,
      &modifyTime
    )) {
      *errorMessage = std::string("error setting timestamps on file: ") + getWindowsErrorMessage();
      return false;
    }
  }
  
  return true;
}

bool getSymlinkType(std::wstring symlinkPath, SymlinkType* symlinkType, std::string* errorMessage) {
  DWORD itemMetaResult = GetFileAttributesW(symlinkPath.c_str());
  
  if (itemMetaResult == INVALID_FILE_ATTRIBUTES) {
    *errorMessage = std::string("error getting symlink attributes: ") + getWindowsErrorMessage();
    return false;
  }
  
  if (!(itemMetaResult & FILE_ATTRIBUTE_REPARSE_POINT)) {
    *errorMessage = "file path not a symlink / reparse point";
    return false;
  }
  
  HANDLE fileHandle = CreateFileW(
    symlinkPath.c_str(),
    0,
    FILE_SHARE_DELETE |
      FILE_SHARE_READ |
      FILE_SHARE_WRITE,
    nullptr,
    OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS |
      FILE_FLAG_OPEN_REPARSE_POINT |
      FILE_FLAG_POSIX_SEMANTICS,
    nullptr
  );
  
  if (fileHandle == INVALID_HANDLE_VALUE) {
    *errorMessage = std::string("error opening file to read reparse data: ") + getWindowsErrorMessage();
    return false;
  }
  
  WindowsHandleCloser fileHandleCloser = WindowsHandleCloser(fileHandle);
  
  union {
    byte outputBuf[65536];
    REPARSE_GUID_DATA_BUFFER reparseData;
  };
  
  DWORD bytesReturned;
  
  if (!DeviceIoControl(
    fileHandle,
    FSCTL_GET_REPARSE_POINT,
    nullptr,
    0,
    &outputBuf,
    65536,
    &bytesReturned,
    nullptr
  )) {
    *errorMessage = std::string("error reading reparse data: ") + getWindowsErrorMessage();
    return false;
  }
  
  switch (reparseData.ReparseTag) {
    case IO_REPARSE_TAG_SYMLINK:
      if (itemMetaResult & FILE_ATTRIBUTE_DIRECTORY) {
        *symlinkType = SymlinkType::DIRECTORY;
      } else {
        *symlinkType = SymlinkType::FILE;
      }
      break;
    
    case IO_REPARSE_TAG_MOUNT_POINT:
      *symlinkType = SymlinkType::DIRECTORY_JUNCTION;
      break;
    
    default: {
      std::stringstream errorMessageStream;
      errorMessageStream << "unrecognized reparse tag value: " << reparseData.ReparseTag;
      *errorMessage = errorMessageStream.str();
      return false;
    }
  }
  
  return true;
}

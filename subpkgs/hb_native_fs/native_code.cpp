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

bool getItemAttributes(std::wstring itemPath, ItemAttributes* itemAttributes, std::string* errorMessage) {
  DWORD itemAttributesResult = GetFileAttributesW(itemPath.c_str());
  
  if (itemAttributesResult == INVALID_FILE_ATTRIBUTES) {
    *errorMessage = getWindowsErrorMessage();
    return false;
  }
  
  itemAttributes->readonly = itemAttributesResult & FILE_ATTRIBUTE_READONLY;
  itemAttributes->hidden = itemAttributesResult & FILE_ATTRIBUTE_HIDDEN;
  itemAttributes->system = itemAttributesResult & FILE_ATTRIBUTE_SYSTEM;
  itemAttributes->archive = itemAttributesResult & FILE_ATTRIBUTE_ARCHIVE;
  itemAttributes->compressed = itemAttributesResult & FILE_ATTRIBUTE_COMPRESSED;
  
  return true;
}

bool setItemAttributes(std::wstring itemPath, ItemAttributesSet itemAttributes, std::string* errorMessage) {
  
}

bool getSymlinkType(std::wstring symlinkPath, SymlinkType* symlinkType, std::string* errorMessage) {
  DWORD itemAttributesResult = GetFileAttributesW(symlinkPath.c_str());
  
  if (itemAttributesResult == INVALID_FILE_ATTRIBUTES) {
    *errorMessage = getWindowsErrorMessage();
    return false;
  }
  
  if (!(itemAttributesResult & FILE_ATTRIBUTE_REPARSE_POINT)) {
    *errorMessage = "file path not a symlink / reparse point";
    return false;
  }
  
  HANDLE fileHandle = CreateFileW(
    symlinkPath.c_str(),
    0,
    FILE_SHARE_DELETE | FILE_SHARE_READ | FILE_SHARE_WRITE,
    nullptr,
    OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS |
      FILE_FLAG_OPEN_REPARSE_POINT |
      FILE_FLAG_POSIX_SEMANTICS,
    nullptr
  );
  
  if (fileHandle == INVALID_HANDLE_VALUE) {
    *errorMessage = getWindowsErrorMessage();
    return false;
  }
  
  WindowsHandleCloser fileHandleCloser = WindowsHandleCloser(fileHandle);
  
  union {
    byte outputBuf[65536];
    REPARSE_GUID_DATA_BUFFER reparseData;
    struct {
      DWORD Symlink_ReparseTag;
      WORD Symlink_ReparseDataLength;
      WORD Symlink_Reserved;
      WORD Symlink_SubstituteNameOffset;
      WORD Symlink_SubstituteNameLength;
      WORD Symlink_PrintNameOffset;
      WORD Symlink_PrintNameLength;
      DWORD Symlink_Flags;
      WCHAR Symlink_PathBuffer[1];
    };
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
    *errorMessage = getWindowsErrorMessage();
    return false;
  }
  
  switch (reparseData.ReparseTag) {
    case IO_REPARSE_TAG_SYMLINK:
      if (itemAttributesResult & FILE_ATTRIBUTE_DIRECTORY) {
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

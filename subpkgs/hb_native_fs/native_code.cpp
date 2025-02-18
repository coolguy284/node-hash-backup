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

constexpr uint64_t NUM_100NS_IN_SEC = 10000000u;
constexpr size_t NUM_100NS_IN_SEC_LOG10 = 7;
constexpr int64_t UNIX_TO_MS_SEC_FACTOR = 11644473600;

bool unixSecStringToWindowsFiletime(std::string unixSecString, FILETIME* resultTime, std::string* errorMessage) {
  // unix string is string with decimal point (optional) represening seconds since Jan 1, 1970 UTC
  // windows file time is 64 bit value representing 100-ns ticks since Jan 1, 1601 UTC
  // unix is 134774 days or 11644473600 seconds later (python: datetime.date(1970,1,1)-datetime.date(1601,1,1))
  // https://learn.microsoft.com/en-us/windows/win32/api/minwinbase/ns-minwinbase-filetime
  // truncates digits after the ending decimal
  
  ULONGLONG fileTimeInt = 0;
  
  size_t decimalLocation = unixSecString.find_first_of('.');
  
  bool dateNegative = false;
  
  if (decimalLocation == unixSecString.npos) {
    // no decimal point
    
    for (size_t i = 0; i < unixSecString.length(); i++) {
      char strChar = unixSecString[i];
      
      if (
        i == 0 ?
          ((strChar < '0' || strChar > '9') && strChar != '-') :
          (strChar < '0' || strChar > '9')
      ) {
        *errorMessage = std::string("string invalid format: ") + unixSecString;
        return false;
      }
    }
    
    try {
      int64_t unixSecInt = std::stoll(unixSecString);
      dateNegative = unixSecInt < 0;
      
      if (unixSecInt > INT64_MAX - UNIX_TO_MS_SEC_FACTOR) {
        *errorMessage = std::string("string causes overflow of unixSecInt: ") + unixSecString;
        return false;
      }
      
      int64_t msSecInt = unixSecInt + UNIX_TO_MS_SEC_FACTOR;
      
      if (msSecInt < 0) {
        *errorMessage = std::string("string time before Jan 1, 1601: ") + unixSecString;
        return false;
      }
      
      fileTimeInt = msSecInt * NUM_100NS_IN_SEC;
      
      // https://stackoverflow.com/questions/1815367/catch-and-compute-overflow-during-multiplication-of-two-large-integers/1815371#1815371
      if (fileTimeInt / NUM_100NS_IN_SEC != msSecInt) {
        *errorMessage = std::string("string causes overflow of fileTimeInt: ") + unixSecString;
        return false;
      }
    } catch (std::invalid_argument) {
      *errorMessage = std::string("string invalid format: ") + unixSecString;
      return false;
    } catch (std::out_of_range) {
      *errorMessage = std::string("string too large: ") + unixSecString;
      return false;
    }
  } else {
    // yes decimal point
    
    for (size_t i = 0; i < decimalLocation; i++) {
      char strChar = unixSecString[i];
      
      if (
        i == 0 ?
          ((strChar < '0' || strChar > '9') && strChar != '-') :
          (strChar < '0' || strChar > '9')
      ) {
        *errorMessage = std::string("string invalid format: ") + unixSecString;
        return false;
      }
    }
    
    try {
      int64_t unixSecInt = std::stoll(unixSecString.substr(0, decimalLocation));
      dateNegative = unixSecInt < 0;
      
      if (unixSecInt > INT64_MAX - UNIX_TO_MS_SEC_FACTOR) {
        *errorMessage = std::string("string causes overflow of unixSecInt: ") + unixSecString;
        return false;
      }
      
      int64_t msSecInt = unixSecInt + UNIX_TO_MS_SEC_FACTOR;
      
      if (msSecInt < 0) {
        *errorMessage = std::string("string time before Jan 1, 1601: ") + unixSecString;
        return false;
      }
      
      fileTimeInt = msSecInt * NUM_100NS_IN_SEC;
      
      // https://stackoverflow.com/questions/1815367/catch-and-compute-overflow-during-multiplication-of-two-large-integers/1815371#1815371
      if (fileTimeInt / NUM_100NS_IN_SEC != msSecInt) {
        *errorMessage = std::string("string causes overflow of fileTimeInt: ") + unixSecString;
        return false;
      }
    } catch (std::invalid_argument) {
      *errorMessage = std::string("string invalid format: ") + unixSecString;
      return false;
    } catch (std::out_of_range) {
      *errorMessage = std::string("string too large: ") + unixSecString;
      return false;
    }
    
    if (decimalLocation + 1 < unixSecString.length()) {
      for (size_t i = decimalLocation + 1; i < unixSecString.length() && i < decimalLocation + 1 + NUM_100NS_IN_SEC_LOG10; i++) {
        char strChar = unixSecString[i];
        
        if (strChar < '0' || strChar > '9') {
          *errorMessage = std::string("string invalid format: ") + unixSecString;
          return false;
        }
      }
      
      try {
        size_t maxSubstringLength = unixSecString.length() - (decimalLocation + 1);
        size_t substringLength = maxSubstringLength < NUM_100NS_IN_SEC_LOG10 ? maxSubstringLength : NUM_100NS_IN_SEC_LOG10;
        
        uint64_t unixFracSecInt = std::stoull(unixSecString.substr(decimalLocation + 1, substringLength));
        for (size_t i = substringLength; i < NUM_100NS_IN_SEC_LOG10; i++) {
          unixFracSecInt *= 10;
        }
        
        if (dateNegative) {
          if (fileTimeInt < unixFracSecInt) {
            *errorMessage = std::string("string fraction causes underflow: ") + unixSecString;
            return false;
          }
          
          fileTimeInt -= unixFracSecInt;
        } else {
          if (fileTimeInt > UINT64_MAX - unixFracSecInt) {
            *errorMessage = std::string("string fraction causes overflow: ") + unixSecString;
            return false;
          }
          
          fileTimeInt += unixFracSecInt;
        }
      } catch (std::invalid_argument) {
        *errorMessage = std::string("string invalid format: ") + unixSecString;
        return false;
      } catch (std::out_of_range) {
        *errorMessage = std::string("string too large: ") + unixSecString;
        return false;
      }
    }
  }
  
  *resultTime = uLongLongIntToFileTime(fileTimeInt);
  return true;
}

bool getItemAttributes(std::wstring itemPath, ItemAttributes* itemAttributes, std::string* errorMessage) {
  DWORD itemAttributesResult = GetFileAttributesW(itemPath.c_str());
  
  if (itemAttributesResult == INVALID_FILE_ATTRIBUTES) {
    *errorMessage = std::string("error getting item attributes: ") + getWindowsErrorMessage();
    return false;
  }
  
  itemAttributes->readonly = itemAttributesResult & FILE_ATTRIBUTE_READONLY;
  itemAttributes->hidden = itemAttributesResult & FILE_ATTRIBUTE_HIDDEN;
  itemAttributes->system = itemAttributesResult & FILE_ATTRIBUTE_SYSTEM;
  itemAttributes->archive = itemAttributesResult & FILE_ATTRIBUTE_ARCHIVE;
  itemAttributes->compressed = itemAttributesResult & FILE_ATTRIBUTE_COMPRESSED;
  
  return true;
}

constexpr DWORD IGNORE_TIMESTAMP_WORD = 0xffffffff;

bool setItemAttributes(std::wstring itemPath, ItemAttributesSet itemAttributes, std::string* errorMessage) {
  FILETIME accessTime;
  FILETIME modifyTime;
  FILETIME createTime;
  
  if (itemAttributes.setAccessTime) {
    std::string subErrorMessage = "";
    if (!unixSecStringToWindowsFiletime(itemAttributes.accessTimeString, &accessTime, &subErrorMessage)) {
      *errorMessage = std::string("error parsing access time: ") + subErrorMessage;
      return false;
    }
  } else {
    accessTime.dwHighDateTime = IGNORE_TIMESTAMP_WORD;
    accessTime.dwLowDateTime = IGNORE_TIMESTAMP_WORD;
  }
  
  if (itemAttributes.setModifyTime) {
    std::string subErrorMessage = "";
    if (!unixSecStringToWindowsFiletime(itemAttributes.modifyTimeString, &modifyTime, &subErrorMessage)) {
      *errorMessage = std::string("error parsing modify time: ") + subErrorMessage;
      return false;
    }
  } else {
    modifyTime.dwHighDateTime = IGNORE_TIMESTAMP_WORD;
    modifyTime.dwLowDateTime = IGNORE_TIMESTAMP_WORD;
  }
  
  if (itemAttributes.setCreateTime) {
    std::string subErrorMessage = "";
    if (!unixSecStringToWindowsFiletime(itemAttributes.createTimeString, &createTime, &subErrorMessage)) {
      *errorMessage = std::string("error parsing create time: ") + subErrorMessage;
      return false;
    }
  } else {
    createTime.dwHighDateTime = IGNORE_TIMESTAMP_WORD;
    createTime.dwLowDateTime = IGNORE_TIMESTAMP_WORD;
  }
  
  DWORD itemAttributesResult = GetFileAttributesW(itemPath.c_str());
  
  if (itemAttributesResult == INVALID_FILE_ATTRIBUTES) {
    *errorMessage = std::string("error getting item attributes: ") + getWindowsErrorMessage();
    return false;
  }
  
  if (itemAttributes.setReadonly) {
    itemAttributesResult &= ~FILE_ATTRIBUTE_READONLY;
    if (itemAttributes.readonly) {
      itemAttributesResult |= FILE_ATTRIBUTE_READONLY;
    }
  }
  
  if (itemAttributes.setHidden) {
    itemAttributesResult &= ~FILE_ATTRIBUTE_HIDDEN;
    if (itemAttributes.hidden) {
      itemAttributesResult |= FILE_ATTRIBUTE_HIDDEN;
    }
  }
  
  if (itemAttributes.setSystem) {
    itemAttributesResult &= ~FILE_ATTRIBUTE_SYSTEM;
    if (itemAttributes.system) {
      itemAttributesResult |= FILE_ATTRIBUTE_SYSTEM;
    }
  }
  
  if (itemAttributes.setArchive) {
    itemAttributesResult &= ~FILE_ATTRIBUTE_ARCHIVE;
    if (itemAttributes.archive) {
      itemAttributesResult |= FILE_ATTRIBUTE_ARCHIVE;
    }
  }
  
  if (itemAttributes.setCompressed) {
    itemAttributesResult &= ~FILE_ATTRIBUTE_COMPRESSED;
    if (itemAttributes.compressed) {
      itemAttributesResult |= FILE_ATTRIBUTE_COMPRESSED;
    }
  }
  
  if (!SetFileAttributesW(itemPath.c_str(), itemAttributesResult)) {
    *errorMessage = std::string("error setting item attributes: ") + getWindowsErrorMessage();
    return false;
  }
  
  if (itemAttributes.setAccessTime || itemAttributes.setModifyTime || itemAttributes.setCreateTime) {
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
  DWORD itemAttributesResult = GetFileAttributesW(symlinkPath.c_str());
  
  if (itemAttributesResult == INVALID_FILE_ATTRIBUTES) {
    *errorMessage = std::string("error getting symlink attributes: ") + getWindowsErrorMessage();
    return false;
  }
  
  if (!(itemAttributesResult & FILE_ATTRIBUTE_REPARSE_POINT)) {
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

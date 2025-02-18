#include "native_code.hpp"

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

bool getItemAttributes(std::wstring itemPath, ItemAttributes* itemAttributes, unsigned long* errorCode) {
  DWORD itemAttributesResult = GetFileAttributesW(itemPath.c_str());
  
  if (itemAttributesResult == INVALID_FILE_ATTRIBUTES) {
    *errorCode = GetLastError();
    return false;
  }
  
  itemAttributes->readonly = itemAttributesResult & FILE_ATTRIBUTE_READONLY;
  itemAttributes->hidden = itemAttributesResult & FILE_ATTRIBUTE_HIDDEN;
  itemAttributes->system = itemAttributesResult & FILE_ATTRIBUTE_SYSTEM;
  itemAttributes->archive = itemAttributesResult & FILE_ATTRIBUTE_ARCHIVE;
  itemAttributes->compressed = itemAttributesResult & FILE_ATTRIBUTE_COMPRESSED;
  
  return true;
}

bool setItemAttributes(std::wstring itemPath, ItemAttributesSet itemAttributes, unsigned long* errorCode) {
  
}

#include <iostream>

bool getSymlinkType(std::wstring symlinkPath, SymlinkType* symlinkType, unsigned long* errorCode) {
  DWORD itemAttributesResult = GetFileAttributesW(symlinkPath.c_str());
  
  if (itemAttributesResult == INVALID_FILE_ATTRIBUTES) {
    *errorCode = GetLastError();
    return false;
  }
  
  if (!(itemAttributesResult & FILE_ATTRIBUTE_REPARSE_POINT)) {
    *errorCode = 1000;
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
    *errorCode = GetLastError();
    return false;
  }
  
  WindowsHandleCloser fileHandleCloser = WindowsHandleCloser(fileHandle);
  
  REPARSE_GUID_DATA_BUFFER reparseData;
  
  DWORD bytesReturned;
  
  if (!DeviceIoControl(
    fileHandle,
    FSCTL_GET_REPARSE_POINT,
    nullptr,
    0,
    &reparseData,
    sizeof(REPARSE_GUID_DATA_BUFFER),
    &bytesReturned,
    nullptr
  )) {
    *errorCode = GetLastError();
    return false;
  }
  
  std::cout << "length: " << reparseData.ReparseDataLength << "\n";
  std::cout << "length: " << reparseData.ReparseTag << "\n";
  std::cout << "length: " << reparseData.Reserved << "\n";
  std::cout << "length: " << reparseData.ReparseDataLength << "\n";
  
  *symlinkType = SymlinkType::FILE;
  
  return true;
}

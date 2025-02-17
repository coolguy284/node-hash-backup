#include "native_code.hpp"

bool getItemAttributes(std::wstring itemPath, ItemAttributes* itemAttributes) {
  DWORD itemAttributesResult = GetFileAttributesW(itemPath.c_str());
  
  if (itemAttributesResult == INVALID_FILE_ATTRIBUTES) {
    return false;
  }
  
  itemAttributes->readonly = itemAttributesResult | FILE_ATTRIBUTE_READONLY;
  itemAttributes->hidden = itemAttributesResult | FILE_ATTRIBUTE_HIDDEN;
  itemAttributes->system = itemAttributesResult | FILE_ATTRIBUTE_SYSTEM;
  itemAttributes->archive = itemAttributesResult | FILE_ATTRIBUTE_ARCHIVE;
  itemAttributes->compressed = itemAttributesResult | FILE_ATTRIBUTE_COMPRESSED;
  
  return true;
}

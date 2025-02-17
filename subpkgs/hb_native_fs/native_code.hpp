#include <string>
#include "Windows.h"

struct ItemAttributes {
  bool readonly;
  bool hidden;
  bool system;
  bool archive;
  bool compressed;
};

bool getItemAttributes(std::wstring itemPath, ItemAttributes* itemAttributes, unsigned long* errorCode);

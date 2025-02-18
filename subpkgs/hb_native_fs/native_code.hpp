#include <string>
#include "Windows.h"

struct ItemAttributes {
  bool readonly;
  bool hidden;
  bool system;
  bool archive;
  bool compressed;
};

struct ItemAttributesSet {
  bool setReadonly = false;
  bool readonly = false;
  bool setHidden = false;
  bool hidden = false;
  bool setSystem = false;
  bool system = false;
  bool setArchive = false;
  bool archive = false;
  bool setCompressed = false;
  bool compressed = false;
  bool setAccessTime = false;
  std::string accessTimeString = "";
  bool setModifyTime = false;
  std::string modifyTimeString = "";
  bool setCreateTime = false;
  std::string createTimeString = "";
};

bool getItemAttributes(std::wstring itemPath, ItemAttributes* itemAttributes, std::string* errorMessage);
bool setItemAttributes(std::wstring itemPath, ItemAttributesSet itemAttributes, std::string* errorMessage);

enum class SymlinkType {
  FILE,
  DIRECTORY,
  DIRECTORY_JUNCTION,
};

bool getSymlinkType(std::wstring symlinkPath, SymlinkType* symlinkType, std::string* errorMessage);

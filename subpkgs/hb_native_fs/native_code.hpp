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
  bool set_readonly = false;
  bool readonly = false;
  bool set_hidden = false;
  bool hidden = false;
  bool set_system = false;
  bool system = false;
  bool set_archive = false;
  bool archive = false;
  bool set_compressed = false;
  bool compressed = false;
  std::string accessTimeString = "";
  std::string modifyTimeString = "";
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

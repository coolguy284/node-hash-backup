#include <string>
#include "Windows.h"

struct ItemMeta {
  bool readonly;
  bool hidden;
  bool system;
  bool archive;
  bool compressed;
};

struct ItemMetaSet {
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
  uint64_t accessTime = 0u;
  bool setModifyTime = false;
  uint64_t modifyTime = 0u;
  bool setCreateTime = false;
  uint64_t createTime = 0u;
};

bool getItemMeta(std::wstring itemPath, ItemMeta* itemMeta, std::string* errorMessage);
bool setItemMeta(std::wstring itemPath, ItemMetaSet itemMeta, std::string* errorMessage);

enum class SymlinkType {
  FILE,
  DIRECTORY,
  DIRECTORY_JUNCTION,
};

bool getSymlinkType(std::wstring symlinkPath, SymlinkType* symlinkType, std::string* errorMessage);

#include <string>
#include <optional>
#include "Windows.h"

struct ItemMeta {
  bool readonly;
  bool hidden;
  bool system;
  bool archive;
  bool compressed;
};

struct ItemMetaSet {
  std::optional<bool> readonly = std::nullopt;
  std::optional<bool> hidden = std::nullopt;
  std::optional<bool> system = std::nullopt;
  std::optional<bool> archive = std::nullopt;
  std::optional<bool> compressed = std::nullopt;
  std::optional<uint64_t> accessTime = std::nullopt;
  std::optional<uint64_t> modifyTime = std::nullopt;
  std::optional<uint64_t> createTime = std::nullopt;
};

bool getItemMeta(std::wstring itemPath, ItemMeta* itemMeta, std::string* errorMessage);
bool setItemMeta(std::wstring itemPath, ItemMetaSet itemMeta, std::string* errorMessage);

enum class SymlinkType {
  FILE,
  DIRECTORY,
  DIRECTORY_JUNCTION,
};

bool getSymlinkType(std::wstring symlinkPath, SymlinkType* symlinkType, std::string* errorMessage);

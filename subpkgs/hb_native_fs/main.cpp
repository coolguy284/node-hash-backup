#include "napi_helper.hpp"
#include "native_code.hpp"
#include <string>
#include <memory>
#include <iostream>

// https://nodejs.org/docs/latest/api/n-api.html#usage

napi_value getItemMetaJS(napi_env env, napi_callback_info info) {
  napi_value arguments[1];
  size_t numArgs = 1;
  NAPI_CALL_RETURN(env, napi_get_cb_info(env, info, &numArgs, arguments, nullptr, nullptr));
  
  if (numArgs < 1) {
    NAPI_CALL_RETURN(env, napi_throw_type_error(env, nullptr, "expected string path for first parameter"));
    return nullptr;
  }
  
  napi_value itemPathObj = arguments[0];
  
  napi_valuetype itemPathType;
  NAPI_CALL_RETURN(env, napi_typeof(env, itemPathObj, &itemPathType));
  if (itemPathType != napi_string) {
    NAPI_CALL_RETURN(env, napi_throw_type_error(env, nullptr, "expected string path for first parameter"));
    return nullptr;
  }
  
  size_t itemPathLength;
  NAPI_CALL_RETURN(env, napi_get_value_string_utf16(env, itemPathObj, nullptr, 0, &itemPathLength));
  
  std::unique_ptr<char16_t> itemPathBuf(new char16_t[itemPathLength + 1]);
  size_t _;
  NAPI_CALL_RETURN(env, napi_get_value_string_utf16(env, itemPathObj, itemPathBuf.get(), itemPathLength + 1, &_));
  std::unique_ptr<wchar_t> itemPathBufWchar(new wchar_t[itemPathLength]);
  for (size_t i = 0; i < itemPathLength; i++) {
    itemPathBufWchar.get()[i] = itemPathBuf.get()[i];
  }
  std::wstring itemPath = std::wstring(itemPathBufWchar.get(), itemPathLength);
  
  ItemMeta itemMeta;
  std::string errorMessage;
  
  if (!getItemMeta(itemPath, &itemMeta, &errorMessage)) {
    NAPI_CALL_RETURN(env, napi_throw_error(env, nullptr, errorMessage.c_str()));
    return nullptr;
  }
  
  napi_value result;
  NAPI_CALL_RETURN(env, napi_create_object(env, &result));
  
  napi_value readonlyObj;
  NAPI_CALL_RETURN(env, napi_get_boolean(env, itemMeta.readonly, &readonlyObj));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "readonly", readonlyObj));
  
  napi_value hiddenObj;
  NAPI_CALL_RETURN(env, napi_get_boolean(env, itemMeta.hidden, &hiddenObj));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "hidden", hiddenObj));
  
  napi_value systemObj;
  NAPI_CALL_RETURN(env, napi_get_boolean(env, itemMeta.system, &systemObj));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "system", systemObj));
  
  napi_value archiveObj;
  NAPI_CALL_RETURN(env, napi_get_boolean(env, itemMeta.archive, &archiveObj));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "archive", archiveObj));
  
  napi_value compressedObj;
  NAPI_CALL_RETURN(env, napi_get_boolean(env, itemMeta.compressed, &compressedObj));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "compressed", compressedObj));
  
  return result;
}

napi_value setItemMetaJS(napi_env env, napi_callback_info info) {
  napi_value arguments[2];
  size_t numArgs = 2;
  NAPI_CALL_RETURN(env, napi_get_cb_info(env, info, &numArgs, arguments, nullptr, nullptr));
  
  if (numArgs < 2) {
    NAPI_CALL_RETURN(env, napi_throw_type_error(env, nullptr, "expected string item path for first parameter and object for second parameter"));
    return nullptr;
  }
  
  napi_value itemPathObj = arguments[0];
  
  napi_valuetype itemPathType;
  NAPI_CALL_RETURN(env, napi_typeof(env, itemPathObj, &itemPathType));
  if (itemPathType != napi_string) {
    NAPI_CALL_RETURN(env, napi_throw_type_error(env, nullptr, "expected string path for first parameter"));
    return nullptr;
  }
  
  size_t itemPathLength;
  NAPI_CALL_RETURN(env, napi_get_value_string_utf16(env, itemPathObj, nullptr, 0, &itemPathLength));
  
  std::unique_ptr<char16_t> itemPathBuf(new char16_t[itemPathLength + 1]);
  size_t _;
  NAPI_CALL_RETURN(env, napi_get_value_string_utf16(env, itemPathObj, itemPathBuf.get(), itemPathLength + 1, &_));
  std::unique_ptr<wchar_t> itemPathBufWchar(new wchar_t[itemPathLength]);
  for (size_t i = 0; i < itemPathLength; i++) {
    itemPathBufWchar.get()[i] = itemPathBuf.get()[i];
  }
  std::wstring itemPath = std::wstring(itemPathBufWchar.get(), itemPathLength);
  
  napi_value itemMetaObj = arguments[1];
  
  napi_valuetype itemMetaType;
  NAPI_CALL_RETURN(env, napi_typeof(env, itemMetaObj, &itemMetaType));
  if (itemMetaType != napi_object) {
    NAPI_CALL_RETURN(env, napi_throw_type_error(env, nullptr, "expected attributes object for second parameter"));
    return nullptr;
  }
  
  ItemMetaSet newMeta;
  
  bool readonlySet;
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemMetaObj, "readonly", &readonlySet));
  if (readonlySet) {
    napi_value readonlyObj;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemMetaObj, "readonly", &readonlyObj));
    bool readonlyValue;
    NAPI_CALL_RETURN(env, napi_get_value_bool(env, readonlyObj, &readonlyValue));
    newMeta.readonly = readonlyValue;
  }
  
  bool hiddenSet;
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemMetaObj, "hidden", &hiddenSet));
  if (hiddenSet) {
    napi_value hiddenObj;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemMetaObj, "hidden", &hiddenObj));
    bool hiddenValue;
    NAPI_CALL_RETURN(env, napi_get_value_bool(env, hiddenObj, &hiddenValue));
    newMeta.hidden = hiddenValue;
  }
  
  bool systemSet;
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemMetaObj, "system", &systemSet));
  if (systemSet) {
    napi_value systemObj;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemMetaObj, "system", &systemObj));
    bool systemValue;
    NAPI_CALL_RETURN(env, napi_get_value_bool(env, systemObj, &systemValue));
    newMeta.system = systemValue;
  }
  
  bool archiveSet;
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemMetaObj, "archive", &archiveSet));
  if (archiveSet) {
    napi_value archiveObj;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemMetaObj, "archive", &archiveObj));
    bool archiveValue;
    NAPI_CALL_RETURN(env, napi_get_value_bool(env, archiveObj, &archiveValue));
    newMeta.archive = archiveValue;
  }
  
  bool compressedSet;
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemMetaObj, "compressed", &compressedSet));
  if (compressedSet) {
    napi_value compressedObj;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemMetaObj, "compressed", &compressedObj));
    bool compressedValue;
    NAPI_CALL_RETURN(env, napi_get_value_bool(env, compressedObj, &compressedValue));
    newMeta.compressed = compressedValue;
  }
  
  bool accessTimeSet;
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemMetaObj, "accessTime", &accessTimeSet));
  if (accessTimeSet) {
    napi_value accessTimeObj;
    bool lossless = false;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemMetaObj, "accessTime", &accessTimeObj));
    uint64_t accessTimeValue;
    NAPI_CALL_RETURN(env, napi_get_value_bigint_uint64(env, accessTimeObj, &accessTimeValue, &lossless));
    if (!lossless) {
      NAPI_CALL_RETURN(env, napi_throw_error(env, nullptr, "access time bigint too large"));
      return nullptr;
    }
    newMeta.accessTime = accessTimeValue;
  }
  
  bool modifyTimeSet;
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemMetaObj, "modifyTime", &modifyTimeSet));
  if (modifyTimeSet) {
    napi_value modifyTimeObj;
    bool lossless = false;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemMetaObj, "modifyTime", &modifyTimeObj));
    uint64_t modifyTimeValue;
    NAPI_CALL_RETURN(env, napi_get_value_bigint_uint64(env, modifyTimeObj, &modifyTimeValue, &lossless));
    if (!lossless) {
      NAPI_CALL_RETURN(env, napi_throw_error(env, nullptr, "modify time bigint too large"));
      return nullptr;
    }
    newMeta.modifyTime = modifyTimeValue;
  }
  
  bool createTimeSet;
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemMetaObj, "createTime", &createTimeSet));
  if (createTimeSet) {
    napi_value createTimeObj;
    bool lossless = false;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemMetaObj, "createTime", &createTimeObj));
    uint64_t createTimeValue;
    NAPI_CALL_RETURN(env, napi_get_value_bigint_uint64(env, createTimeObj, &createTimeValue, &lossless));
    if (!lossless) {
      NAPI_CALL_RETURN(env, napi_throw_error(env, nullptr, "create time bigint too large"));
      return nullptr;
    }
    newMeta.createTime = createTimeValue;
  }
  
  std::string errorMessage;
  
  if (!setItemMeta(itemPath, newMeta, &errorMessage)) {
    NAPI_CALL_RETURN(env, napi_throw_error(env, nullptr, errorMessage.c_str()));
    return nullptr;
  }
  
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

napi_value getSymlinkTypeJS(napi_env env, napi_callback_info info) {
  napi_value arguments[1];
  size_t numArgs = 1;
  NAPI_CALL_RETURN(env, napi_get_cb_info(env, info, &numArgs, arguments, nullptr, nullptr));
  
  if (numArgs < 1) {
    NAPI_CALL_RETURN(env, napi_throw_type_error(env, nullptr, "expected string path for first parameter"));
    return nullptr;
  }
  
  napi_value itemPathObj = arguments[0];
  
  napi_valuetype itemPathType;
  NAPI_CALL_RETURN(env, napi_typeof(env, itemPathObj, &itemPathType));
  if (itemPathType != napi_string) {
    NAPI_CALL_RETURN(env, napi_throw_type_error(env, nullptr, "expected string path for first parameter"));
    return nullptr;
  }
  
  size_t itemPathLength;
  NAPI_CALL_RETURN(env, napi_get_value_string_utf16(env, itemPathObj, nullptr, 0, &itemPathLength));
  
  std::unique_ptr<char16_t> itemPathBuf(new char16_t[itemPathLength + 1]);
  size_t _;
  NAPI_CALL_RETURN(env, napi_get_value_string_utf16(env, itemPathObj, itemPathBuf.get(), itemPathLength + 1, &_));
  std::unique_ptr<wchar_t> itemPathBufWchar(new wchar_t[itemPathLength]);
  for (size_t i = 0; i < itemPathLength; i++) {
    itemPathBufWchar.get()[i] = itemPathBuf.get()[i];
  }
  std::wstring itemPath = std::wstring(itemPathBufWchar.get(), itemPathLength);
  
  SymlinkType symlinkType;
  std::string errorMessage;
  
  if (!getSymlinkType(itemPath, &symlinkType, &errorMessage)) {
    NAPI_CALL_RETURN(env, napi_throw_error(env, nullptr, errorMessage.c_str()));
    return nullptr;
  }
  
  napi_value result;
  std::string symlinkTypeString;
  switch (symlinkType) {
    case SymlinkType::FILE:
      symlinkTypeString = "file";
      break;
    
    case SymlinkType::DIRECTORY:
      symlinkTypeString = "directory";
      break;
    
    case SymlinkType::DIRECTORY_JUNCTION:
      symlinkTypeString = "junction";
      break;
    
    default:
      NAPI_CALL_RETURN(env, napi_throw_type_error(env, nullptr, "symlinkType not found"));
      return nullptr;
  }
  NAPI_CALL_RETURN(env, napi_create_string_latin1(env, symlinkTypeString.c_str(), NAPI_AUTO_LENGTH, &result));
  
  return result;
}

napi_value create_addon(napi_env env) {
  napi_value exports;
  NAPI_CALL_RETURN(env, napi_create_object(env, &exports));
  
  napi_value getItemMetaObj;
  NAPI_CALL_RETURN(env, napi_create_function(env, "getItemMeta", NAPI_AUTO_LENGTH, getItemMetaJS, nullptr, &getItemMetaObj));
  napi_set_named_property(env, exports, "getItemMeta", getItemMetaObj);
  
  napi_value setItemMetaObj;
  NAPI_CALL_RETURN(env, napi_create_function(env, "setItemMeta", NAPI_AUTO_LENGTH, setItemMetaJS, nullptr, &setItemMetaObj));
  napi_set_named_property(env, exports, "setItemMeta", setItemMetaObj);
  
  napi_value getSymlinkTypeObj;
  NAPI_CALL_RETURN(env, napi_create_function(env, "getSymlinkType", NAPI_AUTO_LENGTH, getSymlinkTypeJS, nullptr, &getSymlinkTypeObj));
  napi_set_named_property(env, exports, "getSymlinkType", getSymlinkTypeObj);
  
  return exports;
}

NAPI_MODULE_INIT(/* napi_env env, napi_value exports */) {
  return create_addon(env);
}

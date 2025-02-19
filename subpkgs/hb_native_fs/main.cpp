#include "napi_helper.hpp"
#include "native_code.hpp"
#include <string>
#include <memory>
#include <iostream>

// https://nodejs.org/docs/latest/api/n-api.html#usage

napi_value getItemAttributesJS(napi_env env, napi_callback_info info) {
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
  
  ItemAttributes itemAttributes;
  std::string errorMessage;
  
  if (!getItemAttributes(itemPath, &itemAttributes, &errorMessage)) {
    NAPI_CALL_RETURN(env, napi_throw_error(env, nullptr, errorMessage.c_str()));
    return nullptr;
  }
  
  napi_value result;
  NAPI_CALL_RETURN(env, napi_create_object(env, &result));
  
  napi_value readonlyObj;
  NAPI_CALL_RETURN(env, napi_get_boolean(env, itemAttributes.readonly, &readonlyObj));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "readonly", readonlyObj));
  
  napi_value hiddenObj;
  NAPI_CALL_RETURN(env, napi_get_boolean(env, itemAttributes.hidden, &hiddenObj));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "hidden", hiddenObj));
  
  napi_value systemObj;
  NAPI_CALL_RETURN(env, napi_get_boolean(env, itemAttributes.system, &systemObj));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "system", systemObj));
  
  napi_value archiveObj;
  NAPI_CALL_RETURN(env, napi_get_boolean(env, itemAttributes.archive, &archiveObj));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "archive", archiveObj));
  
  napi_value compressedObj;
  NAPI_CALL_RETURN(env, napi_get_boolean(env, itemAttributes.compressed, &compressedObj));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "compressed", compressedObj));
  
  return result;
}

napi_value setItemAttributesJS(napi_env env, napi_callback_info info) {
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
  
  napi_value itemAttributesObj = arguments[1];
  
  napi_valuetype itemAttributesType;
  NAPI_CALL_RETURN(env, napi_typeof(env, itemPathObj, &itemAttributesType));
  if (itemAttributesType != napi_object) {
    NAPI_CALL_RETURN(env, napi_throw_type_error(env, nullptr, "expected attributes object for first parameter"));
    return nullptr;
  }
  
  ItemAttributesSet newAttributes;
  
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemAttributesObj, "readonly", &newAttributes.setReadonly));
  if (newAttributes.setReadonly) {
    napi_value readonlyObj;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemAttributesObj, "readonly", &readonlyObj));
    NAPI_CALL_RETURN(env, napi_get_value_bool(env, readonlyObj, &newAttributes.readonly));
  }
  
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemAttributesObj, "hidden", &newAttributes.setHidden));
  if (newAttributes.setHidden) {
    napi_value hiddenObj;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemAttributesObj, "hidden", &hiddenObj));
    NAPI_CALL_RETURN(env, napi_get_value_bool(env, hiddenObj, &newAttributes.hidden));
  }
  
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemAttributesObj, "system", &newAttributes.setSystem));
  if (newAttributes.setSystem) {
    napi_value systemObj;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemAttributesObj, "system", &systemObj));
    NAPI_CALL_RETURN(env, napi_get_value_bool(env, systemObj, &newAttributes.system));
  }
  
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemAttributesObj, "archive", &newAttributes.setArchive));
  if (newAttributes.setArchive) {
    napi_value archiveObj;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemAttributesObj, "archive", &archiveObj));
    NAPI_CALL_RETURN(env, napi_get_value_bool(env, archiveObj, &newAttributes.archive));
  }
  
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemAttributesObj, "compressed", &newAttributes.setCompressed));
  if (newAttributes.setCompressed) {
    napi_value compressedObj;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemAttributesObj, "compressed", &compressedObj));
    NAPI_CALL_RETURN(env, napi_get_value_bool(env, compressedObj, &newAttributes.compressed));
  }
  
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemAttributesObj, "accessTime", &newAttributes.setAccessTime));
  if (newAttributes.setAccessTime) {
    napi_value accessTimeObj;
    bool lossless = false;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemAttributesObj, "accessTime", &accessTimeObj));
    NAPI_CALL_RETURN(env, napi_get_value_bigint_uint64(env, accessTimeObj, &newAttributes.accessTime, &lossless));
    if (!lossless) {
      NAPI_CALL_RETURN(env, napi_throw_error(env, nullptr, "access time bigint too large"));
      return nullptr;
    }
  }
  
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemAttributesObj, "modifyTime", &newAttributes.setModifyTime));
  if (newAttributes.setModifyTime) {
    napi_value modifyTimeObj;
    bool lossless = false;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemAttributesObj, "modifyTime", &modifyTimeObj));
    NAPI_CALL_RETURN(env, napi_get_value_bigint_uint64(env, modifyTimeObj, &newAttributes.modifyTime, &lossless));
    if (!lossless) {
      NAPI_CALL_RETURN(env, napi_throw_error(env, nullptr, "modify time bigint too large"));
      return nullptr;
    }
  }
  
  NAPI_CALL_RETURN(env, napi_has_named_property(env, itemAttributesObj, "createTime", &newAttributes.setCreateTime));
  if (newAttributes.setCreateTime) {
    napi_value createTimeObj;
    bool lossless = false;
    NAPI_CALL_RETURN(env, napi_get_named_property(env, itemAttributesObj, "createTime", &createTimeObj));
    NAPI_CALL_RETURN(env, napi_get_value_bigint_uint64(env, createTimeObj, &newAttributes.createTime, &lossless));
    if (!lossless) {
      NAPI_CALL_RETURN(env, napi_throw_error(env, nullptr, "create time bigint too large"));
      return nullptr;
    }
  }
  
  std::string errorMessage;
  
  if (!setItemAttributes(itemPath, newAttributes, &errorMessage)) {
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
  
  napi_value getItemAttributesObj;
  NAPI_CALL_RETURN(env, napi_create_function(env, "getItemAttributes", NAPI_AUTO_LENGTH, getItemAttributesJS, nullptr, &getItemAttributesObj));
  napi_set_named_property(env, exports, "getItemAttributes", getItemAttributesObj);
  
  napi_value setItemAttributesObj;
  NAPI_CALL_RETURN(env, napi_create_function(env, "setSymlinkType", NAPI_AUTO_LENGTH, setItemAttributesJS, nullptr, &setItemAttributesObj));
  napi_set_named_property(env, exports, "setSymlinkType", setItemAttributesObj);
  
  napi_value getSymlinkTypeObj;
  NAPI_CALL_RETURN(env, napi_create_function(env, "getSymlinkType", NAPI_AUTO_LENGTH, getSymlinkTypeJS, nullptr, &getSymlinkTypeObj));
  napi_set_named_property(env, exports, "getSymlinkType", getSymlinkTypeObj);
  
  return exports;
}

NAPI_MODULE_INIT(/* napi_env env, napi_value exports */) {
  return create_addon(env);
}

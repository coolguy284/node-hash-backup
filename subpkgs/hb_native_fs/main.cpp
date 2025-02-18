#include "napi_helper.hpp"
#include "native_code.hpp"
#include <string>
#include <memory>
#include <iostream>

// https://nodejs.org/docs/latest/api/n-api.html#usage

napi_value unixSecStringToWindowsFiletimeJS(napi_env env, napi_callback_info info) {
  napi_value arguments[1];
  size_t numArgs = 1;
  NAPI_CALL_RETURN(env, napi_get_cb_info(env, info, &numArgs, arguments, nullptr, nullptr));
  
  if (numArgs < 1) {
    NAPI_CALL_RETURN(env, napi_throw_type_error(env, nullptr, "expected unix string for first parameter"));
    return nullptr;
  }
  
  napi_value unixStringObj = arguments[0];
  
  napi_valuetype unixStringType;
  NAPI_CALL_RETURN(env, napi_typeof(env, unixStringObj, &unixStringType));
  if (unixStringType != napi_string) {
    NAPI_CALL_RETURN(env, napi_throw_type_error(env, nullptr, "expected string path for first parameter"));
    return nullptr;
  }
  
  size_t unixStringLength;
  NAPI_CALL_RETURN(env, napi_get_value_string_latin1(env, unixStringObj, nullptr, 0, &unixStringLength));
  
  std::unique_ptr<char> unixStringBuf(new char[unixStringLength + 1]);
  size_t _;
  NAPI_CALL_RETURN(env, napi_get_value_string_latin1(env, unixStringObj, unixStringBuf.get(), unixStringLength + 1, &_));
  std::string unixString = std::string(unixStringBuf.get(), unixStringLength);
  
  FILETIME fileTime;
  std::string errorMessage;
  
  if (!unixSecStringToWindowsFiletime(unixString, &fileTime, &errorMessage)) {
    NAPI_CALL_RETURN(env, napi_throw_error(env, nullptr, errorMessage.c_str()));
    return nullptr;
  }
  
  napi_value result;
  NAPI_CALL_RETURN(env, napi_create_object(env, &result));
  
  napi_value dwHighDateTimeObj;
  NAPI_CALL_RETURN(env, napi_create_uint32(env, fileTime.dwHighDateTime, &dwHighDateTimeObj));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "dwHighDateTime", dwHighDateTimeObj));
  
  napi_value dwLowDateTimeObj;
  NAPI_CALL_RETURN(env, napi_create_uint32(env, fileTime.dwLowDateTime, &dwLowDateTimeObj));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "dwLowDateTime", dwLowDateTimeObj));
  
  return result;
}

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
  
  napi_value getSymlinkTypeObj;
  NAPI_CALL_RETURN(env, napi_create_function(env, "getSymlinkType", NAPI_AUTO_LENGTH, getSymlinkTypeJS, nullptr, &getSymlinkTypeObj));
  napi_set_named_property(env, exports, "getSymlinkType", getSymlinkTypeObj);
  
  napi_value unixSecStringToWindowsFiletimeObj;
  NAPI_CALL_RETURN(env, napi_create_function(env, "unixSecStringToWindowsFiletime", NAPI_AUTO_LENGTH, unixSecStringToWindowsFiletimeJS, nullptr, &unixSecStringToWindowsFiletimeObj));
  napi_set_named_property(env, exports, "unixSecStringToWindowsFiletime", unixSecStringToWindowsFiletimeObj);
  
  return exports;
}

NAPI_MODULE_INIT(/* napi_env env, napi_value exports */) {
  return create_addon(env);
}

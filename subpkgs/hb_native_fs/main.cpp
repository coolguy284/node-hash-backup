#include "napi_helper.hpp"
#include "native_code.hpp"
#include <string>
#include <sstream>
#include <memory>

// https://nodejs.org/docs/latest/api/n-api.html#usage

napi_value getItemAttributesJS(napi_env env, napi_callback_info info) {
  napi_value arguments;
  size_t numArgs = 1;
  NAPI_CALL_RETURN(env, napi_get_cb_info(env, info, &numArgs, &arguments, nullptr, nullptr));
  
  if (numArgs < 1) {
    NAPI_CALL_RETURN(env, napi_throw_type_error(env, nullptr, "expected string path for first parameter"));
    return nullptr;
  }
  
  napi_value itemPathObj;
  NAPI_CALL_RETURN(env, napi_get_named_property(env, arguments, "0", &itemPathObj));
  
  size_t itemPathLength;
  NAPI_CALL_RETURN(env, napi_get_value_string_utf16(env, itemPathObj, nullptr, 0, &itemPathLength));
  
  std::unique_ptr<char16_t> itemPathBuf(new char16_t[itemPathLength]);
  size_t _;
  NAPI_CALL_RETURN(env, napi_get_value_string_utf16(env, itemPathObj, itemPathBuf.get(), itemPathLength, &_));
  std::unique_ptr<wchar_t> itemPathBufWchar(new wchar_t[itemPathLength]);
  for (size_t i = 0; i < itemPathLength; i++) {
    itemPathBufWchar.get()[i] = itemPathBuf.get()[i];
  }
  std::wstring itemPath = std::wstring(itemPathBufWchar.get(), itemPathLength);
  
  ItemAttributes itemAttributes;
  unsigned long errorCode;
  
  if (!getItemAttributes(itemPath, &itemAttributes, &errorCode)) {
    std::stringstream message;
    message << "getitemattributes call failed with code ";
    message << errorCode;
    
    NAPI_CALL_RETURN(env, napi_throw_type_error(env, nullptr, message.str().c_str()));
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

napi_value create_addon(napi_env env) {
  napi_value exports;
  NAPI_CALL_RETURN(env, napi_create_object(env, &exports));
  
  napi_value getItemAttributesObj;
  NAPI_CALL_RETURN(env, napi_create_function(env, "getItemAttributes", NAPI_AUTO_LENGTH, getItemAttributesJS, nullptr, &getItemAttributesObj));
  napi_set_named_property(env, exports, "getItemAttributes", getItemAttributesObj);
  
  return exports;
}

NAPI_MODULE_INIT(/* napi_env env, napi_value exports */) {
  return create_addon(env);
}

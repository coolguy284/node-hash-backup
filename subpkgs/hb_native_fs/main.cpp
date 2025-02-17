#include "napi_helper.hpp"

// https://nodejs.org/docs/latest/api/n-api.html#usage

napi_value getItemAttributes(napi_env env, napi_callback_info info) {
  napi_value result;
  NAPI_CALL_RETURN(env, napi_create_object(env, &result));
  
  napi_value readonlyObj;
  NAPI_CALL_RETURN(env, napi_get_boolean(env, false, &readonlyObj));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "readonly", readonlyObj));
  
  return result;
}

napi_value create_addon(napi_env env) {
  napi_value exports;
  NAPI_CALL_RETURN(env, napi_create_object(env, &exports));
  
  napi_value getItemAttributesObj;
  NAPI_CALL_RETURN(env, napi_create_function(env, "getItemAttributes", NAPI_AUTO_LENGTH, getItemAttributes, nullptr, &getItemAttributesObj));
  napi_set_named_property(env, exports, "getItemAttributes", getItemAttributesObj);
  
  return exports;
}

NAPI_MODULE_INIT(/* napi_env env, napi_value exports */) {
  return create_addon(env);
}

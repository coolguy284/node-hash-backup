#include "napi_helper.hpp"

// https://nodejs.org/docs/latest/api/n-api.html#usage

napi_value create_addon(napi_env env) {
  napi_value result;
  NAPI_CALL_RETURN(env, napi_create_object((env), &result));
  
  napi_value test;
  NAPI_CALL_RETURN(env, napi_create_string_utf8((env), "test_string", NAPI_AUTO_LENGTH, &test));
  NAPI_CALL_RETURN(env, napi_set_named_property(env, result, "test", test));
  
  return result;
}

NAPI_MODULE_INIT(/* napi_env env, napi_value exports */) {
  return create_addon(env);
}

#include "napi_helper.hpp"

// https://nodejs.org/docs/latest/api/n-api.html#usage

napi_value create_addon(napi_env env) {
  napi_value result;
  
  NAPI_CALL_RETURN(env, napi_create_object((env), &result));
  
  return result;
}

NAPI_MODULE_INIT(/* napi_env env, napi_value exports */) {
  return create_addon(env);
}

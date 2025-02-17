#define NAPI_VERSION 9
#define NAPI_EXPERIMENTAL
#include <node_api.h>

bool process_napi_call(napi_env env, napi_status call_result);

// https://nodejs.org/docs/latest/api/n-api.html#usage
#define NAPI_CALL_RETURN(env, call) if (!process_napi_call((env), (call))) { return nullptr; }

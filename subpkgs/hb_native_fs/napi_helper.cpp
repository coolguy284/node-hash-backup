#include "napi_helper.hpp"

// https://nodejs.org/docs/latest/api/n-api.html#usage
bool process_napi_call(napi_env env, napi_status call_result) {
  if (call_result != napi_ok) {
    const napi_extended_error_info* error_info = nullptr;
    napi_get_last_error_info((env), &error_info);
    const char* err_message = error_info->error_message;
    bool is_pending;
    napi_is_exception_pending(env, &is_pending);
    if (!is_pending) {
      const char* new_err_message = (err_message == nullptr) ? "empty error message" : err_message;
      napi_throw_error(env, nullptr, new_err_message);
    }
    
    return false;
  }
  
  return true;
}

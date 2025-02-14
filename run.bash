set -e

code_dir=$(dirname $0)

(
  cd $code_dir
  
  if [[ ! -d node_modules ]]; then
    npm i --omit=dev --include=optional || (
      (
        npm i --omit=dev --omit=optional ||
        (echo Error installing modules && exit 1)
      ) && echo Error installing optional modules, but regular modules worked
    )
  fi
)

# https://stackoverflow.com/questions/3811345/how-to-pass-all-arguments-passed-to-my-bash-script-to-a-function-of-mine/3816747#3816747
node $code_dir "$@"

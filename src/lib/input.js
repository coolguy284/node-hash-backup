module.exports = async function _getUserInput() {
  let prompt = 'Choice (y/n, default n): ';
  let choices = new Map([
    ['y', true],
    ['n', false],
  ]);
  
  process.stdout.write(prompt);
  let choice = choices.get(await new Promise(r => {
    process.stdin.once('data', c => r(c.toString().trim()));
  }));
  
  return choice == null ? choices.get('n') : choice;
};
